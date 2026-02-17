# Enterprise Lead Management System v2.1

![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)
![Status](https://img.shields.io/badge/status-ready_for_production-green.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)

A professional, enterprise-grade CRM and Lead Management System built for high performance, offline capability, and seamless desktop integration.

---

## 🚀 **Overview**

The Enterprise Lead Management System is a robust application designed to streamline lead tracking, sales processes, and customer relationship management. Built with modern web technologies and wrapped for desktop deployment, it offers a native-like experience with the flexibility of a web application.

### **Key Highlights**
- **Offline First**: Full functionality without internet access, syncing changes when online.
- **High Performance**: Virtual scrolling for handling 1000+ records smoothly.
- **Real-time Collaboration**: WebSocket-based updates and conflict resolution.
- **Enterprise Security**: Role-based access, password-protected exports, and local data encryption.
- **Automated Workflows**: Email parsing, status automation, and stale lead highlighting.

---

## 📦 **Features**

### **Core Functionality**
- **Lead Management**: Complete lifecycle tracking (New -> Qualified -> Deal Won/Lost).
- **Advanced Search**: Debounced, multi-criteria filtering with saved views.
- **Bulk Operations**: Mass assignment, deletion, and status updates.
- **Import/Export**: detailed Excel/CSV support with password protection and data validation.

### **Reliability & Data Integrity**
- **Optimistic Locking**: Prevents overwrite conflicts when multiple users edit the same record.
- **Idempotency**: Ensures API operations are processed exactly once, preventing duplicate actions.
- **Audit Trails**: Comprehensive logging of all critical actions for security and compliance.
- **TestSprite Integration**: Automated, comprehensive test coverage for backend and frontend.

### **Desktop Integration (Electron)**
- **Native Installer**: Automatic setup, desktop shortcuts, and start menu integration.
- **Low-Resource Mode**: Optimized for hardware with limited RAM/CPU.
- **Auto-Update**: Built-in mechanisms for seamless version upgrades.

---

## 🛠️ **Technology Stack**

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **UI Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Database**: [Prisma](https://www.prisma.io/) with SQLite (Production) / Better-SQLite3
- **Desktop Runtime**: [Electron](https://www.electronjs.org/)
- **State Management**: React Query (TanStack Query v5)
- **Testing**: Playwright, TestSprite, Vitest

---

## ⚡ **Getting Started**

### **Prerequisites**
- **Node.js**: v18.17.0 or higher
- **OS**: Windows 10/11 (for Installer builds)

### **Installation**

1.  **Clone the repository** (if applicable) or extract the source.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Initialize Database**:
    ```bash
    npm run db:push
    npm run db:seed
    ```

### **Run Locally**

- **Web Development Mode**:
  ```bash
  npm run dev
  ```
  Opens [http://localhost:3000](http://localhost:3000).

- **Electron Development Mode**:
  ```bash
  npm run electron-dev
  ```
  Runs the React app and wraps it in an Electron window.

---

## 📜 **Scripts**

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Next.js development server. |
| `npm run build` | Build the Next.js application for production. |
| `npm run package:client` | **Build & Package** the full Windows installer (Recommended). |
| `npm run test:testsprite` | Run the full E2E test suite (Playwright + TestSprite). |
| `npm run lint` | Run code quality checks. |
| `npm run db:studio` | Open Prisma Studio to inspect the database. |
| `npm run db:backup` | Backup the local SQLite database. |

---

## 🧪 **Testing & Quality Assurance**

This project maintains high code quality through a rigorous testing strategy:

- **E2E Testing**: Powered by Playwright and TestSprite. Covers Auth, Leads, Offline mode, and Performance.
- **Unit Testing**: Vitest for utility functions and hooks.
- **Performance**: Automated FPS and render time checks for large lists.

**Run All Tests:**
```bash
npm run test:testsprite
```

**View Report:**
Check `testsprite_tests/testsprite-execution-report.md` after execution.

---

## 🔧 **Build & Deployment**

### **Creating a Release**
To create a distributable Windows Installer (`.exe`):

1.  Ensure all tests pass: `npm run test:testsprite`
2.  Run the packager:
    ```bash
    npm run package:client
    ```
3.  **Output**: Check the `dist/` folder for the setup executable (e.g., `Enterprise Lead Management System Setup 2.1.0.exe`).

### **Verification**
After building, verify the artifact integrity:
```bash
npm run verify:build
```

---

## 🧩 **Project Structure**

- `/app`: Next.js App Router pages and API routes.
- `/components`: Reusable UI components.
- `/lib`: Shared utilities, database clients, auth logic.
- `/prisma`: Database schema and migrations.
- `/electron`: Electron main process and preload scripts.
- `/e2e`: Playwright end-to-end test specs.
- `/scripts`: Build, test, and maintenance scripts.

---

## 🛡️ **API Route Patterns**

All API routes use the `withApiHandler` wrapper for consistent middleware composition.

### **Declarative Permissions**

```typescript
import { PERMISSIONS } from '@/app/types/permissions';

export const GET = withApiHandler(
    { 
        authRequired: true, 
        permissions: [PERMISSIONS.LEADS_VIEW_ALL]
    },
    async (req, context) => { /* handler */ }
);
```

### **Permission Logic**

**OR Logic** (user needs ANY permission):
```typescript
permissions: [PERMISSIONS.LEADS_VIEW_OWN, PERMISSIONS.LEADS_VIEW_ALL],
requireAll: false
```

**AND Logic** (user needs ALL permissions):
```typescript
permissions: [PERMISSIONS.LEADS_EDIT, PERMISSIONS.LEADS_ASSIGN],
requireAll: true  // default
```

### **Special Options**

| Option | Description |
|--------|-------------|
| `skipTenantCheck: true` | For routes without tenant context (OAuth, auth) |
| `useApiKeyAuth: true` | Use API key authentication instead of session |

See `app/types/permissions.ts` for the complete list of available permissions.

---

## 🔑 **Default Credentials** (Dev/Test)


- **Admin User**: `admin`
- **Password**: `admin123`
- **Export Password**: `admin123`

*> ⚠️ **Security Note**: Change these credentials immediately upon first deployment in a production environment.*

---

## 🤝 **Troubleshooting**

### **Common Issues**

1.  **"Windows protected your PC" (SmartScreen)**:
    - *Cause*: Unsigned installer (common for internal tools).
    - *Fix*: Click "More info" -> "Run anyway".

2.  **Excel Import Fails**:
    - *Fix*: Ensure the file is not password protected (unless using the specific secure import feature) and matches the CSV/XLSX template.

3.  **Database Locked**:
    - *Fix*: Close any open Prisma Studio instances or other processes accessing `dev.db`.

---

*© 2025 Enterprise Lead Management System. All rights reserved.*