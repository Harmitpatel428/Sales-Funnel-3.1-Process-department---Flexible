# API Documentation

This document outlines the REST API endpoints available in the Lead Management System.

## Authentication

All API endpoints are protected and require a valid session cookie.
The session is managed via strict HTTP-only cookies.
The `session` object provides:
- `userId`
- `role`
- `tenantId`

## Response Format

All API responses follow a standard wrapper format:

```json
{
  "success": boolean,
  "data": any,      // On success
  "message": string, // Error message or success message
  "error": any       // Validation errors or debug info (optional)
}
```

## Lead Management

### List Leads
`GET /api/leads`

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 10)
- `search` (Search term for name, company, email, phone)
- `status` (Comma-separated status values)
- `dateStart`, `dateEnd` (Filter by creation date)

### Create Lead
`POST /api/leads`

**Body:**
```json
{
  "clientName": "John Doe",
  "company": "Acme Corp",
  "mobileNumber": "1234567890",
  "email": "john@example.com",
  ... (other lead fields)
}
```

### Get Single Lead
`GET /api/leads/[id]`

### Update Lead
`PUT /api/leads/[id]`

**Body:** (Partial lead object)

### Delete Lead (Soft Delete)
`DELETE /api/leads/[id]`

Sets `isDeleted` to true.

### Assign Lead
`POST /api/leads/[id]/assign`

**Body:**
```json
{
  "userId": "user-uuid"
}
```

### Forward Lead to Process (Convert to Case)
`POST /api/leads/[id]/forward`

**Body:**
```json
{
  "schemeType": "Solar Rooftop",
  "benefitTypes": ["Subsidy A", "Subsidy B"], // Optional, creates one case per type
  "companyType": "Private Ltd",
  "termLoanAmount": "500000",
  ... (other process fields)
}
```
**Response:**
Returns created case IDs.

### Lead Activities
`GET /api/leads/[id]/activities`
`POST /api/leads/[id]/activities`

**Body (POST):**
```json
{
  "description": "Called client, no answer",
  "activityType": "call",
  "duration": 5 // minutes
}
```

## Case Management

### List Cases
`GET /api/cases`
(Automatically filtered by user role visibility)

**Query Parameters:**
- `page`, `limit`
- `search`
- `status`
- `priority`
- `assignee`

### Create Case
`POST /api/cases`

**Body:**
```json
{
  "leadId": "lead-uuid", // Optional if manual
  "schemeType": "Solar",
  ...
}
```

### Get Legacy Case
`GET /api/cases/[id]`

### Update Case
`PUT /api/cases/[id]`

### Delete Case (Hard Delete)
`DELETE /api/cases/[id]`

### Update Case Status
`PATCH /api/cases/[id]/status`

**Body:**
```json
{
  "newStatus": "DOCUMENTS_RECEIVED"
}
```

### Assign Case
`POST /api/cases/[id]/assign`

**Body:**
```json
{
  "userId": "user-uuid",
  "roleId": "PROCESS_EXECUTIVE" // Optional override
}
```

### Bulk Assign Cases
`POST /api/cases/bulk-assign`

**Body:**
```json
{
  "caseIds": ["id1", "id2"],
  "userId": "user-uuid"
}
```

## Error Codes
- 400: Bad Request (Validation failed)
- 401: Unauthorized (Not logged in)
- 403: Forbidden (Insufficient permissions)
- 404: Not Found
- 429: Too Many Requests (Rate limit exceeded)
- 500: Internal Server Error

