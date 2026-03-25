# CycleMonitor - Natural Fertility Tracking

A privacy-focused, open-source fertility tracking application built with [Wasp](https://wasp.sh), based on the [Open Saas](https://opensaas.sh) template.

## Overview

CycleMonitor is a comprehensive fertility awareness application designed to help users track their menstrual cycles using evidence-based Fertility Awareness Methods (FAM). The app provides tools for monitoring multiple fertility indicators including basal body temperature (BBT), cervical fluid, menstrual flow, and ovulation predictor kit results.

### Key Features

- **Privacy-First**: Your fertility data stays with you. Self-hostable and transparent.
- **Data Control**: Import cycle data from CSV files and maintain full database access.
- **Evidence-Based**: Built on established fertility awareness methods and cycle tracking principles.
- **Multi-Indicator Tracking**: Comprehensive fertility sign monitoring for accurate cycle insights.

## Core Features

### 🔄 Cycle Management
- Create and manage multiple menstrual cycles
- Track cycle start and end dates
- View current and historical cycles with cycle day count displayed in the title (e.g. "Cycle #1: 28 days"); active cycles show the number of recorded entries, past cycles show the total cycle span
- Delete cycles with cascade deletion of all associated data
- Chronological cycle navigation on the days page: **Previous Cycle** always links to the cycle that started before the current one, **Next Cycle** to the one that started after

### 📝 Daily Data Entry
Track multiple fertility indicators for each day:

- **Basal Body Temperature (BBT)**
  - Record temperature with time tracking
  - Support for both Fahrenheit and Celsius
  - Automatic unit conversion and storage
  - Flag outlier temperatures to exclude from interpretation

- **Cervical Fluid Tracking**
  - **Appearance**: None, Sticky, Creamy, Watery, Eggwhite
  - **Sensation**: Dry, Damp, Wet, Slippery
  - Built-in educational tooltips for each category

- **Menstrual Flow**
  - Track flow levels: Spotting, Light, Medium, Heavy, Very Heavy
  - Educational guidance on distinguishing spotting from menstruation
  - Visual indicators on chart: watercolor blood drops for spotting, graduated bars for flow levels

- **Ovulation Predictor Kit (OPK)**
  - Track LH hormone levels: Low, Rising, Peak, Declining
  - Detailed descriptions for interpreting test results

- **Disturbance Factor Tracking**
  - Multi-select section for logging factors that may affect BBT reliability
  - Eight factors, each with a dedicated emoji and explanatory tooltip:
    - 🌙 Poor Sleep · ✈️ Travel · 😵 Stress · 🤒 Illness/Fever · ⏰ Different Wake Time · 🍷 Alcohol the Evening Before · 💊 Medication · 🌡️ Hot/Cold Room
  - Displayed in a two-column responsive grid (single column on mobile)
  - Each factor has an info (ℹ) icon; hovering reveals a detailed explanation
  - The section title itself has a hover tooltip: "Something that may cause your basal body temperature rise or drop, making the reading less reliable"
  - Selecting ✈️ **Travel** reveals an optional time-difference stepper (–12 to +12 hours) to record timezone or schedule changes
  - All selected factors and the travel time difference are persisted with the day entry and pre-populated when editing

- **Additional Tracking**
  - Intercourse tracking
  - Custom notes and observations

### 📊 Data Visualization
- Interactive cycle charts displaying temperature patterns
- Color-coded fertility indicators
- Visual representation of cervical fluid and menstrual flow
- **Menstrual Flow Symbols**:
  - **Spotting**: Custom blood drop SVG icon (three drops with shine highlights)
  - **Light/Medium/Heavy/Very Heavy**: Graduated bar heights with color intensity
- LH test status row on chart with symbols (low, rising, peak, declining)
- Flower markers on Peak LH days in the temperature graph
- **Missing-day markers** on the BBT line: a hollow circle (`#d9d9d9` fill, white border matching regular BBT nodes, same radius as a normal BBT dot) with a coral ✕ (`#FF6B6B`) inside, centered at the interpolated temperature position for each day with no recorded BBT between two consecutive included readings
- Green gradient fertile window highlighting for Rising/Peak LH days
- "Fertile Window" label centered on the fertile period
- Day-by-day detailed view
- **Interactive Crosshair & Tooltip System**:
  - **Vertical Crosshair**: A dashed line spans the entire chart height when hovering/tapping anywhere in the graph plot area over a column with recorded data
  - **Graph-Only Activation**: The crosshair and tooltip are triggered exclusively by hovering (or tapping on mobile) within the temperature graph section. The table rows below the graph respond visually (column highlight) but do not independently trigger the tooltip
  - **Smart Hover Detection**: Only columns with recorded data (BBT, time, OPK, intimacy, cervical fluid, menstrual flow, or disturbance factors) are interactive; columns without any data remain non-interactive
  - **No-Temperature Days**: Days that have recorded data but no temperature reading still activate the crosshair and tooltip when hovering over the corresponding vertical column in the graph area. The tooltip shows the date, cycle day number, and any disturbance factor symbols
  - **Unified Tooltip**: A single, context-aware tooltip displays comprehensive day information including date, weekday, cycle day number, temperature (if recorded), time stamp, intercourse status, exclusion flags, and disturbance factors as emoji symbols
  - **Disturbance Factor Symbols in Tooltip**: If disturbance factors were recorded, they appear as individual emoji symbols. For the Travel factor, the time difference is always shown before the emoji (e.g. `+3h ✈️` or `-1h ✈️`). A negative time change flips the plane emoji horizontally via CSS `scaleX(-1)` to indicate westward/behind-schedule travel. Full symbol legend: 🌙 Poor sleep · ✈️ Travel · 😵 Stress · 🤒 Illness/Fever · ⏰ Different wake time · 🍷 Alcohol · 💊 Medication · 🌡️ Hot/Cold room
  - **Mobile Touch Support**: Touch events (`touchstart`, `touchmove`, `touchend`) are handled natively on the ApexCharts canvas. Touching a column activates the crosshair and tooltip; the tooltip is **pinned** immediately on finger-lift (`touchend`) and stays visible until the user taps another column or taps anywhere outside the chart. Moving to a different column while holding updates the tooltip to that column. Horizontal **or vertical** scroll gestures (>10 px movement on either axis) dismiss the tooltip immediately and do not pin. ApexCharts zoom is disabled to prevent its internal touch handlers from interfering with the custom touch logic. A synthetic `click` fired by the browser after `touchend` is suppressed (600 ms guard) so it cannot toggle the pin off
  - **Tooltip Overflow Guard**: On narrow screens the tooltip automatically flips to the left of the crosshair when there is insufficient space on the right
  - **Technical Implementation**: Custom React overlay with native DOM event listeners on the ApexCharts canvas for reliable detection, independent of the charting library's tooltip system
  - **Edit from Chart**: The tooltip card shows a compact **Edit** button at the bottom that navigates directly to the day entry form (`/cycles/:cycleId/add-day?dayId=...`). On desktop the button shows the text "Edit" (ghost style); on mobile it shows a pencil icon (outline style). The tooltip **persists unconditionally** — it does not auto-dismiss when the cursor moves away — so the Edit button is always reachable. Explicit dismissal paths:
    - **Desktop**: hovering a different column switches the tooltip to that day; clicking a column pins/unpins it; clicking anywhere outside the chart container or within the canvas but outside the plot area dismisses the tooltip entirely.
    - **Mobile**: lifting the finger pins the tooltip; tapping another column switches and repins; tapping outside the chart dismisses.
    - **Stable cell-centre positioning**: the tooltip X position is anchored to the hovered day's column centre (`crosshairX`) rather than the live cursor position, giving a deterministic location for each day.
    - **Overflow flip**: when the tooltip would overflow the right edge of the container it flips to the left, positioned so its right edge sits 4 px to the left of the cell centre.
  - **Date and Weekday Formatting in Tooltip**: The tooltip displays dates in **DD MMM YYYY** format (e.g. "24 Oct 2025") and weekdays as full names (e.g. "Monday") rather than abbreviations
- **Disturbance Row in Chart Table**: A dedicated "Disturbance" row appears below the "Dry" cervical fluid row in the lower chart table, styled with a light violet (`#f3e8ff`) background using the same rounded-square cell pattern as the cervical fluid rows (0.5 px white gap on all sides, `borderRadius: 2px`). Each cell shows the disturbance recorded for that day:
  - Single disturbance: the corresponding emoji (🌙 😵 🤒 ⏰ 🍷 💊 🌡️)
  - Travel with a positive time difference: ✈️ (normal orientation)
  - Travel with a negative time difference: ✈️ horizontally flipped via CSS `scaleX(-1)` to indicate westward/behind-schedule travel
  - Two or more disturbances on the same day: a count followed by a warning symbol (e.g. `3⚠️`)

### 📥 CSV Import
- Import cycle data from CSV files
- Automatic temperature unit detection
- Smart date-based day matching and overwriting
- Creates new cycles or updates existing ones based on date ranges

### ⚙️ User Settings
- Temperature unit preference (Fahrenheit/Celsius)
- Persistent settings across sessions
- Automatic temperature conversion in all views, including the Recent Entries list on the Add/Edit Day page

### 🔐 Authentication & Account Management
- Email-based signup and login
- Email verification for account security
- Password reset functionality
- Secure session management

## Technology Stack

### Framework & Core
- **Wasp** `^0.18.0` - Full-stack declarative framework for React & Node.js
- **TypeScript** - Full type safety across client and server

### Frontend
- **React** - UI library with hooks and functional components
- **React Router** - Client-side routing
- **ShadCN UI v2** - Accessible, customizable component library
- **Tailwind CSS** - Utility-first CSS framework

### Backend
- **Node.js** - Server runtime
- **Prisma ORM** - Type-safe database access
- **PostgreSQL** - Relational database

### Authentication & Email
- **Wasp Auth** - Built-in authentication with email verification
- **SMTP** - Email provider (configurable)

## Development Setup

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **PostgreSQL** (v12 or higher)
- **Wasp CLI** - Install via: `curl -sSL https://get.wasp-lang.dev/installer.sh | sh`

### Getting Started

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cycle-path/app
   ```

2. **Set up environment variables**
   
   Create `.env.server` in the app root:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/cyclemonitor"
   # Add SMTP credentials for email functionality
   SMTP_HOST="your-smtp-host"
   SMTP_PORT="587"
   SMTP_USERNAME="your-username"
   SMTP_PASSWORD="your-password"
   ```
   
   Create `.env.client` in the app root (if needed):
   ```env
   # Client-side environment variables
   ```

3. **Start the database**
   ```bash
   wasp start db
   ```
   
   Leave this running in a separate terminal. This starts a PostgreSQL instance in Docker.

4. **Run database migrations**
   ```bash
   wasp db migrate-dev
   ```
   
   This applies all schema migrations from the `migrations/` directory.

5. **Start the development server**
   ```bash
   wasp start
   ```
   
   This starts both the client (React) and server (Node.js) in development mode.
   - Client: `http://localhost:3000`
   - Server: `http://localhost:3001`

6. **[Optional] Seed test data**
   ```bash
   wasp db seed
   ```
   
   This populates the database with mock users for development.

### First-Time Setup Notes

- After starting the app, you'll need to create an account via the signup page
- Email verification links will be printed to the server console (when using Dummy email provider in development)
- Check the server logs for any email-related output during signup/password reset

## Project Architecture

### Configuration Files

- **[`main.wasp`](main.wasp)** - Central configuration file defining:
  - App metadata and settings
  - Routes and pages
  - Database operations (queries and actions)
  - Authentication configuration
  - Email sender setup
  - Job scheduling

- **[`schema.prisma`](schema.prisma)** - Database schema defining:
  - `User` - User accounts with settings relationship
  - `UserSettings` - Temperature unit preferences
  - `Cycle` - Menstrual cycle records
  - `CycleDay` - Daily fertility observations
  - Enums for `TemperatureUnit`, `CervicalAppearance`, `CervicalSensation`, `OpkStatus`, `MenstrualFlow`

### Directory Structure

```
app/
├── main.wasp                 # Wasp configuration
├── schema.prisma             # Database schema
├── migrations/               # Prisma migrations
├── src/
│   ├── cycle-tracking/       # Core cycle tracking feature
│   │   ├── operations.ts     # Server-side queries and actions
│   │   ├── CyclesPage.tsx    # Cycle list and management
│   │   ├── AddCycleDayPage.tsx # Daily entry form
│   │   ├── CycleDaysPage.tsx # Day list view with chronological cycle navigation
│   │   ├── CycleChartPage.tsx # Visual chart display
│   │   ├── NewCyclePage.tsx  # Create new cycle
│   │   ├── SettingsPage.tsx  # User settings
│   │   ├── SideNav.tsx       # Navigation component
│   │   └── utils.ts          # Utilities (temp conversion, dates)
│   ├── auth/                 # Authentication pages
│   │   ├── LoginPage.tsx
│   │   ├── SignupPage.tsx
│   │   └── email-and-pass/   # Email auth components
│   ├── components/ui/        # ShadCN UI components
│   ├── client/               # Client root and shared components
│   │   ├── App.tsx           # Root app component
│   │   └── components/
│   ├── landing-page/         # Public landing page
│   ├── user/                 # User account management
│   └── server/               # Server utilities and scripts
└── public/                   # Static assets
```

### Operations Pattern

Wasp uses a declarative operations pattern for client-server communication:

1. **Define in `main.wasp`**:
   ```wasp
   query getUserCycles {
     fn: import { getUserCycles } from "@src/cycle-tracking/operations",
     entities: [Cycle, CycleDay]
   }
   ```

2. **Implement in `operations.ts`**:
   ```typescript
   export const getUserCycles: GetUserCycles = async (args, context) => {
     if (!context.user) throw new HttpError(401);
     return context.entities.Cycle.findMany({
       where: { userId: context.user.id },
       include: { days: true }
     });
   };
   ```

3. **Use in React components**:
   ```typescript
   import { useQuery } from 'wasp/client/operations';
   import { getUserCycles } from 'wasp/client/operations';
   
   const { data: cycles, isLoading } = useQuery(getUserCycles);
   ```

### Type Safety

Wasp generates TypeScript types automatically:
- **Entities**: Import from `wasp/entities` (e.g., `import type { Cycle, CycleDay } from 'wasp/entities'`)
- **Operations**: Import from `wasp/server/operations` (e.g., `import type { GetUserCycles } from 'wasp/server/operations'`)
- **Client Operations**: Import from `wasp/client/operations` (auto-typed hooks and functions)

### Key Files Reference

- **[`main.wasp`](main.wasp)** - App configuration, routes, operations, auth setup
- **[`schema.prisma`](schema.prisma)** - Database models: User, Cycle, CycleDay, UserSettings
- **[`src/cycle-tracking/operations.ts`](src/cycle-tracking/operations.ts)** - Server-side cycle operations
- **[`src/cycle-tracking/CycleChartPage.tsx`](src/cycle-tracking/CycleChartPage.tsx)** - Main chart visualization with:
  - LH test status row display
  - Peak LH flower markers with stacking-aware overlays
  - Fertile window gradient visualization
  - Missing BBT day markers: 14×14 px SVG overlay per null-BBT day between two consecutive included readings; hollow circle (r=5, `#d9d9d9` fill, white stroke, strokeWidth=2 — matching normal BBT dot border) with a coral ✕ (`#FF6B6B`, strokeWidth=1.5) inside; positioned at the linearly-interpolated temperature y-coordinate
  - Inline SVG blood drop icon for spotting indicator
  - Disturbance row below "Dry": light violet CF-style cells; ✈️ normal for positive travel time diff, ✈️ flipped (`scaleX(-1)`) for negative; `N⚠️` for multiple factors
  - Tooltip travel display: `+Xh ✈️` / `-Xh ✈️flipped` with hour offset always shown when a time diff is recorded
  - Touch event support for crosshair/tooltip on mobile (touchstart/touchmove/touchend on ApexCharts canvas; tap-to-pin; dismiss on tap outside)
  - Tooltip persists until explicit dismissal: `dismissTooltip()` called only by document-level `pointerdown` outside the chart container, canvas click outside the plot area, or horizontal/vertical scroll gesture on touch (both axes tracked via `touchStartXRef`/`touchStartYRef`)
  - Synthetic `click` after `touchend` suppressed via `lastTouchEndTimeRef` (600 ms guard) to prevent immediate unpin
  - ApexCharts zoom disabled (`zoom: { enabled: false }`) to prevent internal touch handler interference
  - Canvas event listeners are auto-reattached via a `MutationObserver` on the chart container, so the tooltip keeps working after ApexCharts replaces its DOM (e.g. after a React Query background refetch triggered by mobile focus/visibility events)
  - Tooltip hover shield: invisible `pointer-events-auto` extension on the cursor-approach side
  - Tooltip anchored to cell-centre crosshair for stable, per-day positioning (no live-cursor chase)
  - Pinned tooltip state (`pinnedDayNumber`/`pinnedCrosshairX`) shared by both desktop click and mobile tap
- **[`src/cycle-tracking/AddCycleDayPage.tsx`](src/cycle-tracking/AddCycleDayPage.tsx)** - Daily entry form with all fertility indicators; the Recent Entries list at the bottom of the page displays BBT in the user's chosen temperature unit via `formatTemperature`
- **[`src/cycle-tracking/utils.ts`](src/cycle-tracking/utils.ts)** - Temperature conversion, date utilities, and cycle helpers (`fahrenheitToCelsius`, `formatDate`, `formatDateLong`, `formatDateDDMMMYYYY`, `getDayOfWeek`, `getDayOfWeekAbbreviation`, `getCycleDayCount`)

## UI Components

This template includes [ShadCN UI](https://ui.shadcn.com/) v2 for beautiful, accessible React components. See [SHADCN_SETUP.md](./SHADCN_SETUP.md) for details on how to use and add ShadCN components in your app.

All ShadCN components are located in [`src/components/ui/`](src/components/ui/).

## Deployment

### Fly.io (Recommended)

CycleMonitor can be deployed to Fly.io using the Wasp CLI:

```bash
wasp deploy fly launch <app-name> <region>
```

For detailed deployment instructions, see:
- Wasp deployment docs: https://wasp.sh/docs/deploying
- Project deployment guide: `.cursor/rules/deployment`

### Environment Variables for Production

Set these environment variables in your production environment:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname"
SMTP_HOST="your-smtp-host"
SMTP_PORT="587"
SMTP_USERNAME="your-username"
SMTP_PASSWORD="your-password"
```

### Database Migrations

Run migrations in production after deploying:

```bash
wasp deploy fly cmd --context server migrate deploy
```

## Contributing

### Development Workflow

1. **Adding a new feature**:
   - Define data models in [`schema.prisma`](schema.prisma)
   - Run `wasp db migrate-dev "Description"` to create migration
   - Define operations (queries/actions) in [`main.wasp`](main.wasp)
   - Implement operations in `src/[feature]/operations.ts`
   - Create UI components and pages
   - Add routes in [`main.wasp`](main.wasp)

2. **Code Style**:
   - Use TypeScript for all code
   - Follow existing patterns in the codebase
   - Use Wasp's generated types (`wasp/entities`, `wasp/server/operations`)
   - Import Wasp modules with `wasp/...` prefix (not `@wasp/...`)
   - Use ShadCN UI components for consistency

3. **Wasp Patterns**:
   - Define operations in [`main.wasp`](main.wasp) with proper entity dependencies
   - Keep operation implementations in feature-specific `operations.ts` files
   - Use `useQuery` for data fetching, direct `await` for actions (not `useAction`)
   - Handle errors with `HttpError` from `wasp/server`

4. **Database Changes**:
   - Always create migrations: `wasp db migrate-dev "Description"`
   - Test migrations on clean database before committing
   - Update operation entity dependencies in [`main.wasp`](main.wasp) when adding/modifying entities

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes following the code style guidelines
4. Test thoroughly in development
5. Commit with clear, descriptive messages
6. Push to your fork and submit a pull request

## License & Credits

- Built with [Wasp](https://wasp.sh) - A full-stack framework for React & Node.js
- Based on the [Open Saas](https://opensaas.sh) template
- UI components from [ShadCN UI](https://ui.shadcn.com/)

## Support & Resources

- **Wasp Documentation**: https://wasp.sh/docs
- **Wasp Discord**: https://discord.gg/rzdnErX
- **Open SaaS Documentation**: https://docs.opensaas.sh

---

For questions or issues, please open an issue on the repository.
