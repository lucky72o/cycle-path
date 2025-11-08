import daBoiAvatar from '../client/static/da-boi.webp';
import kivo from '../client/static/examples/kivo.webp';
import messync from '../client/static/examples/messync.webp';
import microinfluencerClub from '../client/static/examples/microinfluencers.webp';
import promptpanda from '../client/static/examples/promptpanda.webp';
import reviewradar from '../client/static/examples/reviewradar.webp';
import scribeist from '../client/static/examples/scribeist.webp';
import searchcraft from '../client/static/examples/searchcraft.webp';
import { BlogUrl, DocsUrl } from '../shared/common';
import type { GridFeature } from './components/FeaturesGrid';

export const features: GridFeature[] = [
  {
    name: 'BBT Charting',
    description: 'Track your basal body temperature with precision to identify ovulation patterns and fertile windows.',
    emoji: '🌡️',
    href: DocsUrl,
    size: 'medium',
  },
  {
    name: 'Cervical Fluid',
    description: 'Monitor cervical mucus quality and quantity - a key fertility sign for natural family planning.',
    emoji: '💧',
    href: DocsUrl,
    size: 'medium',
  },
  {
    name: 'Cervical Position',
    description: 'Track cervical position and firmness changes throughout your menstrual cycle.',
    emoji: '🔍',
    href: DocsUrl,
    size: 'small',
  },
  {
    name: 'Ovulation Prediction',
    description: 'Advanced algorithms predict your ovulation date and fertile window based on your fertility signs.',
    emoji: '🎯',
    href: DocsUrl,
    size: 'large',
  },
  {
    name: 'Color-Coded Charts',
    description: 'Visual fertility charts with color-coded indicators for easy interpretation of your cycle data.',
    emoji: '📊',
    href: DocsUrl,
    size: 'medium',
  },
  {
    name: 'Peak Fertility Days',
    description: 'Identify your most fertile days based on cervical fluid and temperature shift patterns.',
    emoji: '⭐',
    href: DocsUrl,
    size: 'small',
  },
  {
    name: 'Cycle Analysis',
    description: 'Comprehensive cycle analysis with cover line, temperature shifts, and fertility insights.',
    emoji: '📈',
    href: DocsUrl,
    size: 'medium',
  },
  {
    name: 'Educational Resources',
    description: 'Learn fertility awareness methods with built-in guides and educational content.',
    emoji: '📚',
    href: DocsUrl,
    size: 'small',
  },
  {
    name: 'Mobile App',
    description: 'Access your fertility data anywhere with our mobile app for iOS and Android.',
    emoji: '📱',
    href: DocsUrl,
    size: 'medium',
  },
  {
    name: 'Data Export',
    description: 'Export your cycle data as CSV files for backup, sharing, or analysis with healthcare providers.',
    emoji: '💾',
    href: DocsUrl,
    size: 'small',
  },
];

export const testimonials = [
  {
    name: 'Da Boi',
    role: 'Wasp Mascot',
    avatarSrc: daBoiAvatar,
    socialUrl: 'https://twitter.com/wasplang',
    quote: "I don't even know how to code. I'm just a plushie.",
  },
  {
    name: 'Mr. Foobar',
    role: 'Founder @ Cool Startup',
    avatarSrc: daBoiAvatar,
    socialUrl: '',
    quote: 'This product makes me cooler than I already am.',
  },
  {
    name: 'Jamie',
    role: 'Happy Customer',
    avatarSrc: daBoiAvatar,
    socialUrl: '#',
    quote: 'My cats love it!',
  },
];

export const faqs = [
  {
    id: 1,
    question: 'How do I get started with BBT charting?',
    answer: 'BBT charting is a great way to understand your menstrual cycle and identify fertile days. Take your temperature first thing in the morning before moving, eating, or drinking. Chart consistently throughout your cycle to see patterns emerge.',
    href: '#',
  },
  {
    id: 2,
    question: 'What is cervical fluid and why is it important?',
    answer: 'Cervical fluid is a key fertility sign that changes throughout your cycle. Fertile cervical fluid (egg white consistency) indicates approaching ovulation and helps sperm reach the egg for fertilization.',
    href: '#',
  },
  {
    id: 3,
    question: 'How does the app predict ovulation?',
    answer: 'Our algorithms analyze your temperature patterns and cervical fluid observations to predict ovulation. We look for sustained temperature shifts and fertile cervical fluid patterns to identify your most fertile days.',
    href: '#',
  },
  {
    id: 4,
    question: 'What conditions can affect my BBT readings?',
    answer: 'Fever, illness, inconsistent sleep, alcohol, smoking, medication, stress, and changes in routine can all impact your basal body temperature. Note any unusual circumstances when charting.',
    href: '#',
  },
  {
    id: 5,
    question: 'How do I know when I\'m most fertile?',
    answer: 'Peak fertility occurs during your fertile window, typically marked by fertile cervical fluid and confirmed by a sustained temperature shift after ovulation. The app highlights these days in green on your chart.',
    href: '#',
  },
  {
    id: 6,
    question: 'Can I export my fertility data?',
    answer: 'Yes! You can export your cycle data as CSV files for backup, sharing with healthcare providers, or personal analysis. Your fertility data belongs to you.',
    href: '#',
  },
];

export const footerNavigation = {
  app: [
    { name: 'Fertility Guide', href: DocsUrl },
    { name: 'Community Forum', href: BlogUrl },
    { name: 'Mobile App', href: '#' },
  ],
  company: [
    { name: 'About FAM', href: '#' },
    { name: 'Privacy Policy', href: '#' },
    { name: 'Terms of Service', href: '#' },
    { name: 'Medical Disclaimer', href: '#' },
  ],
};

export const examples = [
  {
    name: 'Example #1',
    description: 'Describe your example here.',
    imageSrc: kivo,
    href: '#',
  },
  {
    name: 'Example #2',
    description: 'Describe your example here.',
    imageSrc: messync,
    href: '#',
  },
  {
    name: 'Example #3',
    description: 'Describe your example here.',
    imageSrc: microinfluencerClub,
    href: '#',
  },
  {
    name: 'Example #4',
    description: 'Describe your example here.',
    imageSrc: promptpanda,
    href: '#',
  },
  {
    name: 'Example #5',
    description: 'Describe your example here.',
    imageSrc: reviewradar,
    href: '#',
  },
  {
    name: 'Example #6',
    description: 'Describe your example here.',
    imageSrc: scribeist,
    href: '#',
  },
  {
    name: 'Example #7',
    description: 'Describe your example here.',
    imageSrc: searchcraft,
    href: '#',
  },
];
