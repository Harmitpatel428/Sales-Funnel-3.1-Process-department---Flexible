# Role-Based Access Control (RBAC) System Guide

This document outlines the implementation and usage of the new RBAC system in the Sales Funnel application.

## Overview

The RBAC system replaces the legacy hardcoded role checks with a granular permission-based model. It supports:
- **Custom Roles:** Admins can create roles with specific sets of permissions.
- **Granular Permissions:** Over 50+ permissions covering Leads, Cases, Users, audit logs, and settings.
- **Field-Level Security:** Control view/edit access to sensitive fields (e.g., `salary`, `profitMargin`).
- **Record-Level Access:** Scoped access (Own, Assigned, Team, All) for data visibility.

## Architecture

### Database Models
- **Permission:** Stores available system permissions.
- **Role:** customizable roles linked to permissions.
- **RolePermission:** Many-to-many link between Role and Permission.
- **FieldPermission:** Defines field-level access per role.
- **User:** Now references `roleId` (custom role) in addition to legacy `role` enum.

### Middleware (`lib/middleware/permissions.ts`)
- **`getUserPermissions(userId)`:** Caches and returns all permissions for a user.
- **`requirePermissions`:** wrapper for API routes to enforce access.
- **`getRecordLevelFilter`:** Generates Prisma filters based on user scope.

### Frontend Integration
- **`UserContext`:** Exposes `hasPermission`, `canViewField`, `canEditField`.
- **`RoleGuard`:** Component to protect routes/sections.
- **`FieldPermissionGuard`:** Component to conditionally render sensitive fields.

## Usage

### 1. Creating Custom Roles
Navigate to **Users > Roles** tab.
- Click "Create Custom Role".
- Enter Name and Description.
- Select permissions from the categorized list.
- Save.

### 2. Protecting API Routes
Use the `requirePermissions` helper in your route handlers:

```typescript
import { requirePermissions } from '@/lib/middleware/permissions';
import { PERMISSIONS } from '@/app/types/permissions';

export async function GET(req) {
  // Check if user has VIEW privilege
  const error = await requirePermissions([PERMISSIONS.LEADS_VIEW_OWN])(req);
  if (error) return error;
  
  // ... logic
}
```

### 3. Frontend Permission Checks
Use the `useUsers` hook:

```typescript
const { hasPermission, canViewField } = useUsers();

if (hasPermission('leads.create')) {
  // Show create button
}
```

### 4. Field-Level Security
Wrap sensitive UI elements:

```tsx
<FieldPermissionGuard resource="leads" fieldName="salary" fallback="***">
   <span>{lead.salary}</span>
</FieldPermissionGuard>
```

## Testing
An admin can use the **Permission Testing Panel** in the Roles page to "View As" another user/role and verify access rights in real-time.

## Default Roles (Migration)
Legacy roles (ADMIN, SALES_EXECUTIVE, etc.) are mapped to a default set of permissions to ensure backward compatibility. New users should be assigned Custom Roles for full flexibility.
