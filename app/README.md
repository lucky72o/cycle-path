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
- View current and historical cycles
- Delete cycles with cascade deletion of all associated data

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
- Green gradient fertile window highlighting for Rising/Peak LH days
- "Fertile Window" label centered on the fertile period
- Day-by-day detailed view
- **Interactive Crosshair & Tooltip System**:
  - **Vertical Crosshair**: A dashed line spans the entire chart height when hovering/tapping on any day with recorded data
  - **Multi-Source Activation**: Triggerable from both the temperature graph plot area and any table cell (date/weekday/cycle day headers, time stamps, LH tests, intimacy markers, cervical fluid, or menstrual flow)
  - **Smart Hover Detection**: Only days with recorded data (BBT, time, OPK, intimacy, cervical fluid, or menstrual flow) are interactive; days without data remain non-interactive for a cleaner experience
  - **Unified Tooltip**: A single, context-aware tooltip displays comprehensive day information including date, weekday, cycle day number, temperature (if recorded), time stamp, intercourse status, and exclusion flags
  - **Mobile Touch Support**: Touch events (`touchstart`, `touchmove`) mirror desktop hover behavior. A tap on a data column activates the crosshair and tooltip; the tooltip persists after lifting the finger and dismisses on a tap outside the chart. Horizontal scroll gestures (>10 px movement) are distinguished from taps and clear the tooltip rather than locking it open
  - **Tooltip Overflow Guard**: On narrow screens the tooltip automatically flips to the left of the crosshair when there is insufficient space on the right
  - **Technical Implementation**: Custom React overlay with native DOM event listeners for reliable detection, independent of the charting library's tooltip system
  - **Edit from Chart**: The tooltip card is always interactive and shows a compact **Edit** button at the bottom that navigates directly to the day entry form (`/cycles/:cycleId/add-day?dayId=...`). On desktop the button shows the text "Edit" (ghost style); on mobile it shows a pencil icon (outline style). The Edit button is reachable by moving the cursor from any data cell or temperature node into the tooltip — no click required. This is implemented via several complementary mechanisms:
    - **Hover bridge**: the tooltip card catches `onMouseEnter` and cancels a 600 ms delayed close, keeping the tooltip open while the cursor travels from the trigger to the card.
    - **Hover shield**: the outer tooltip wrapper is extended 56 px toward the cursor (left in the normal case, right when flipped). This invisible `pointer-events-auto` zone blocks adjacent cells from firing `mouseenter` while the cursor is in transit, preventing the tooltip from jumping to a new position mid-travel (the "chase effect").
    - **Stable cell-centre positioning**: the tooltip X position is anchored to the hovered day's column centre (`crosshairX`) rather than the live cursor position. This makes the tooltip appear at a deterministic, predictable location for each day regardless of where within the column the cursor enters.
    - **Improved overflow flip**: when the tooltip would overflow the right edge of the container it flips to the left, and is now positioned so its right edge sits only 4 px to the left of the cell centre, minimising the travel distance to the Edit button.
    - On touch devices, tapping any interactive cell or node **pins** the tooltip (making it persistent) so the Edit button can be tapped; the pin clears when tapping the same cell again or tapping outside the chart.
  - **Date and Weekday Formatting in Tooltip**: The tooltip displays dates in **DD MMM YYYY** format (e.g. "24 Oct 2025") and weekdays as full names (e.g. "Monday") rather than abbreviations

### 📥 CSV Import
- Import cycle data from CSV files
- Automatic temperature unit detection
- Smart date-based day matching and overwriting
- Creates new cycles or updates existing ones based on date ranges

### ⚙️ User Settings
- Temperature unit preference (Fahrenheit/Celsius)
- Persistent settings across sessions
- Automatic temperature conversion in all views

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
│   │   ├── CycleDaysPage.tsx # Day list view
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
  - Inline SVG blood drop icon for spotting indicator
  - Touch event support for crosshair/tooltip on mobile (touchstart/touchmove on canvas and all table cells; dismiss on tap outside)
  - Tooltip hover shield: invisible `pointer-events-auto` extension on the cursor-approach side blocks adjacent cells from re-triggering during transit
  - Tooltip anchored to cell-centre crosshair for stable, per-day positioning (no live-cursor chase)
  - 600 ms delayed close with `cancelClose`/`scheduleClose` helpers and `tooltipHoveredRef` hover bridge
  - Pinned tooltip state (`pinnedDayNumber`/`pinnedCrosshairX`) for persistent touch interaction
- **[`src/cycle-tracking/AddCycleDayPage.tsx`](src/cycle-tracking/AddCycleDayPage.tsx)** - Daily entry form with all fertility indicators
- **[`src/cycle-tracking/utils.ts`](src/cycle-tracking/utils.ts)** - Temperature conversion and date utilities (`fahrenheitToCelsius`, `formatDate`, `formatDateLong`, `formatDateDDMMMYYYY`, `getDayOfWeek`, `getDayOfWeekAbbreviation`)

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
