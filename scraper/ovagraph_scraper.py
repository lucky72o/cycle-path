import requests
import time
import re
from urllib.parse import urljoin, urlparse, urldefrag
from pathlib import Path

from bs4 import BeautifulSoup

# -----------------------------
# BASIC SETTINGS
# -----------------------------

START_URL = "https://www.ovagraph.com/"
ALLOWED_DOMAIN = "www.ovagraph.com"  # only crawl this domain
OUTPUT_DIR = Path(__file__).resolve().parent / "ovagraph_export"  # always relative to this script
REQUEST_DELAY_SECONDS = 1.0  # pause between requests to be polite


# -----------------------------
# HELPER FUNCTIONS
# -----------------------------

def is_same_domain(url: str) -> bool:
    """Check if URL is on ovagraph.com (same domain)."""
    parsed = urlparse(url)
    return parsed.netloc == ALLOWED_DOMAIN


def clean_url(url: str) -> str:
    """
    Remove URL fragments like #section and strip whitespace.
    Example: "https://site.com/page#top" -> "https://site.com/page"
    """
    url, _frag = urldefrag(url)
    return url.strip()


def should_skip_url(url: str) -> bool:
    """
    Decide if we should skip this URL.
    We skip:
      - non-http(s)
      - login/register-type URLs
      - obvious forum pages (optional – adjust as you like)
    """
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        return True

    # Only stay on allowed domain
    if parsed.netloc != ALLOWED_DOMAIN:
        return True

    path = parsed.path.lower()

    # Skip login / register / account-related URLs
    skip_fragments = [
        "/login",
        "/sign-in",
        "/signin",
        "/register",
        "/account",
        "/user",
    ]

    if any(fragment in path for fragment in skip_fragments):
        return True

    # If you do NOT want forum content, uncomment this:
    # if "/forums" in path:
    #     return True

    return False


def fetch_html(url: str) -> str | None:
    """Download the HTML for a URL. Return the text, or None if it fails."""
    print(f"Fetching: {url}")
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; ovagraph-scraper/1.0)"
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)
    except requests.RequestException as e:
        print(f"  ERROR: request failed: {e}")
        return None

    if response.status_code != 200:
        print(f"  ERROR: status code {response.status_code}")
        return None

    return response.text


def slugify(text: str) -> str:
    """
    Turn a string into a safe filename.
    Example: "Free Ovulation Calendar" -> "free-ovulation-calendar"
    """
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text or "page"


def extract_main_content(html: str, url: str) -> dict:
    """
    Extract title, headings, paragraphs and lists from HTML.
    This is a generic extractor, but tuned to be reasonable for ovagraph.com.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Page title (from <title> tag)
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    else:
        title = url

    # Try to find a <main> element first (often holds the main content)
    main = soup.find("main")
    if not main:
        # Fallback: use the <body>
        main = soup.body or soup

    content_blocks = []

    # We'll walk through elements in the main section and keep only useful tags
    for elem in main.descendants:
        # Skip things that aren't real tags
        if not hasattr(elem, "name"):
            continue

        # elem.name can be None, so guard against that
        if elem.name is None:
            continue

        name = elem.name.lower()

        # Headings
        if name in ("h1", "h2", "h3"):
            text = elem.get_text(strip=True)
            if not text:
                continue
            level = int(name[1])
            content_blocks.append(("heading", level, text))

        # Paragraphs
        elif name == "p":
            text = elem.get_text(" ", strip=True)
            if not text:
                continue
            content_blocks.append(("paragraph", None, text))

        # Lists (unordered/ordered)
        elif name in ("ul", "ol"):
            items = []
            for li in elem.find_all("li", recursive=False):
                li_text = li.get_text(" ", strip=True)
                if li_text:
                    items.append(li_text)
            if items:
                content_blocks.append(("list", name, items))

    return {
        "url": url,
        "title": title,
        "blocks": content_blocks,
    }


def content_to_markdown(page: dict) -> str:
    """
    Convert extracted content into Markdown text.
    Markdown is a simple text format with # for headings, - for bullet lists, etc.
    """
    lines = []
    title = page["title"]

    # Top-level title
    lines.append(f"# {title}")
    lines.append("")  # blank line

    # Add source URL
    lines.append(f"_Source: {page['url']}_")
    lines.append("")

    for block_type, info1, info2 in page["blocks"]:
        if block_type == "heading":
            level = info1  # 1, 2, or 3
            text = info2
            hashes = "#" * (level + 1) if level > 1 else "##"
            # We start h1 at #, but the page title already used #,
            # so use ##, ###, #### for h1, h2, h3 inside content.
            lines.append(f"{hashes} {text}")
            lines.append("")

        elif block_type == "paragraph":
            text = info2
            lines.append(text)
            lines.append("")

        elif block_type == "list":
            list_type = info1  # "ul" or "ol"
            items = info2
            if list_type == "ul":
                for item in items:
                    lines.append(f"- {item}")
            else:
                # ordered list
                for i, item in enumerate(items, start=1):
                    lines.append(f"{i}. {item}")
            lines.append("")

    return "\n".join(lines).strip() + "\n"


# -----------------------------
# CRAWLER
# -----------------------------

def crawl_site(start_url: str) -> list[dict]:
    """
    Crawl the site starting from start_url.
    Returns a list of page dicts with extracted content.
    """
    OUTPUT_DIR.mkdir(exist_ok=True)

    to_visit = [start_url]
    seen = set()
    pages = []

    while to_visit:
        current_url = to_visit.pop(0)
        current_url = clean_url(current_url)

        if current_url in seen:
            continue
        seen.add(current_url)

        if should_skip_url(current_url):
            print(f"Skipping (filtered): {current_url}")
            continue

        html = fetch_html(current_url)
        if html is None:
            continue

        page = extract_main_content(html, current_url)
        pages.append(page)

        # Save markdown file for this page
        save_page_markdown(page)

        # Find new links to follow
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            absolute_url = urljoin(current_url, href)
            absolute_url = clean_url(absolute_url)
            if absolute_url not in seen and is_same_domain(absolute_url):
                if not should_skip_url(absolute_url):
                    to_visit.append(absolute_url)

        # Be polite: wait a bit between requests
        time.sleep(REQUEST_DELAY_SECONDS)

    return pages


def save_page_markdown(page: dict) -> None:
    """Save one page to a Markdown file inside OUTPUT_DIR."""
    url = page["url"]
    parsed = urlparse(url)

    # Build a file name based on path or title
    if parsed.path and parsed.path != "/":
        base = parsed.path.strip("/").replace("/", "-")
    else:
        base = slugify(page["title"])

    # Clean filename further
    base = slugify(base)

    filename = OUTPUT_DIR / f"{base or 'index'}.md"

    md_text = content_to_markdown(page)
    filename.write_text(md_text, encoding="utf-8")
    print(f"  Saved: {filename}")


def save_index(pages: list[dict]) -> None:
    """Create an index.md with links to all page files."""
    index_path = OUTPUT_DIR / "index.md"

    lines = [
        "# OvaGraph Site Export",
        "",
        "This is an index of the pages scraped from https://www.ovagraph.com/.",
        "",
    ]

    for page in pages:
        url = page["url"]
        parsed = urlparse(url)

        if parsed.path and parsed.path != "/":
            base = parsed.path.strip("/").replace("/", "-")
        else:
            base = slugify(page["title"])

        base = slugify(base)
        filename = f"{base or 'index'}.md"
        title = page["title"]

        lines.append(f"- [{title}]({filename})")

    index_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nIndex saved at: {index_path}")


# -----------------------------
# MAIN ENTRY POINT
# -----------------------------

if __name__ == "__main__":
    print(f"Starting crawl from: {START_URL}")
    pages = crawl_site(START_URL)
    save_index(pages)
    print("\nDone. All files are in the folder:", OUTPUT_DIR)
