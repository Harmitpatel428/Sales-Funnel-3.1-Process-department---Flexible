"""
Sales Funnel CRM SDK for Python

Installation:
    pip install crm-sdk

Usage:
    from crm_sdk import CRMClient
    client = CRMClient(api_key='your_api_key')
"""

import requests
from typing import Optional, Dict, Any, List
from dataclasses import dataclass


class CRMError(Exception):
    """CRM API Error"""
    def __init__(self, message: str, code: str, status: int):
        self.message = message
        self.code = code
        self.status = status
        super().__init__(self.message)


@dataclass
class Lead:
    """Lead data class"""
    id: str
    client_name: Optional[str] = None
    email: Optional[str] = None
    mobile_number: Optional[str] = None
    company: Optional[str] = None
    source: Optional[str] = None
    status: str = "NEW"
    notes: Optional[str] = None


class CRMClient:
    """Sales Funnel CRM API Client"""
    
    def __init__(self, api_key: str, base_url: str = "https://api.example.com"):
        self.api_key = api_key
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        })
    
    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make an API request"""
        url = f"{self.base_url}{endpoint}"
        response = self.session.request(method, url, **kwargs)
        
        try:
            data = response.json()
        except:
            data = {"error": {"message": response.text, "code": "UNKNOWN"}}
        
        if not response.ok:
            raise CRMError(
                message=data.get("error", {}).get("message", "API request failed"),
                code=data.get("error", {}).get("code", "UNKNOWN_ERROR"),
                status=response.status_code
            )
        
        return data
    
    # Lead Operations
    class Leads:
        def __init__(self, client: "CRMClient"):
            self._client = client
        
        def list(
            self,
            page: int = 1,
            limit: int = 50,
            status: Optional[str] = None,
            search: Optional[str] = None
        ) -> Dict[str, Any]:
            """List leads with optional filtering"""
            params = {"page": page, "limit": limit}
            if status:
                params["status"] = status
            if search:
                params["search"] = search
            return self._client._request("GET", "/api/v1/leads", params=params)
        
        def get(self, lead_id: str) -> Dict[str, Any]:
            """Get a single lead by ID"""
            return self._client._request("GET", f"/api/v1/leads/{lead_id}")
        
        def create(
            self,
            client_name: str,
            email: Optional[str] = None,
            mobile_number: Optional[str] = None,
            company: Optional[str] = None,
            source: Optional[str] = None,
            status: str = "NEW",
            notes: Optional[str] = None,
            custom_fields: Optional[Dict] = None
        ) -> Dict[str, Any]:
            """Create a new lead"""
            data = {
                "clientName": client_name,
                "status": status
            }
            if email:
                data["email"] = email
            if mobile_number:
                data["mobileNumber"] = mobile_number
            if company:
                data["company"] = company
            if source:
                data["source"] = source
            if notes:
                data["notes"] = notes
            if custom_fields:
                data["customFields"] = custom_fields
            
            return self._client._request("POST", "/api/v1/leads", json=data)
        
        def update(self, lead_id: str, **kwargs) -> Dict[str, Any]:
            """Update an existing lead"""
            # Convert snake_case to camelCase
            data = {}
            field_map = {
                "client_name": "clientName",
                "mobile_number": "mobileNumber",
                "custom_fields": "customFields"
            }
            for key, value in kwargs.items():
                camel_key = field_map.get(key, key)
                data[camel_key] = value
            
            return self._client._request("PUT", f"/api/v1/leads/{lead_id}", json=data)
        
        def delete(self, lead_id: str) -> Dict[str, Any]:
            """Delete a lead"""
            return self._client._request("DELETE", f"/api/v1/leads/{lead_id}")
        
        def bulk_import(
            self,
            records: List[Dict],
            skip_duplicates: bool = True
        ) -> Dict[str, Any]:
            """Bulk import leads"""
            return self._client._request(
                "POST",
                "/api/bulk/import",
                json={
                    "records": records,
                    "entityType": "leads",
                    "options": {"skipDuplicates": skip_duplicates}
                }
            )
        
        def export(
            self,
            format: str = "json",
            status: Optional[str] = None
        ) -> Dict[str, Any]:
            """Export leads"""
            params = {"format": format, "entityType": "leads"}
            if status:
                params["status"] = status
            return self._client._request("GET", "/api/bulk/export", params=params)
    
    @property
    def leads(self) -> Leads:
        return self.Leads(self)
    
    # Webhook Operations
    class Webhooks:
        def __init__(self, client: "CRMClient"):
            self._client = client
        
        def list(self) -> Dict[str, Any]:
            """List webhook subscriptions"""
            return self._client._request("GET", "/api/webhooks/outgoing")
        
        def subscribe(
            self,
            url: str,
            events: List[str],
            auth_type: str = "API_KEY",
            auth_config: Optional[Dict] = None
        ) -> Dict[str, Any]:
            """Subscribe to webhook events"""
            data = {
                "url": url,
                "events": events,
                "authType": auth_type
            }
            if auth_config:
                data["authConfig"] = auth_config
            return self._client._request("POST", "/api/webhooks/outgoing", json=data)
        
        def unsubscribe(self, subscription_id: str) -> Dict[str, Any]:
            """Unsubscribe from webhook"""
            return self._client._request("DELETE", f"/api/webhooks/outgoing/{subscription_id}")
    
    @property
    def webhooks(self) -> Webhooks:
        return self.Webhooks(self)
    
    # Integration Operations
    class Integrations:
        def __init__(self, client: "CRMClient"):
            self._client = client
        
        def list(self, category: Optional[str] = None) -> Dict[str, Any]:
            """List available integrations"""
            params = {}
            if category:
                params["category"] = category
            return self._client._request("GET", "/api/integrations", params=params)
        
        def install(self, slug: str, config: Dict) -> Dict[str, Any]:
            """Install an integration"""
            return self._client._request(
                "POST",
                f"/api/integrations/{slug}/install",
                json={"config": config}
            )
        
        def uninstall(self, slug: str) -> Dict[str, Any]:
            """Uninstall an integration"""
            return self._client._request("DELETE", f"/api/integrations/{slug}/install")
    
    @property
    def integrations(self) -> Integrations:
        return self.Integrations(self)
    
    # Analytics Operations
    class Analytics:
        def __init__(self, client: "CRMClient"):
            self._client = client
        
        def usage(self, days: int = 30) -> Dict[str, Any]:
            """Get API usage statistics"""
            return self._client._request("GET", f"/api/analytics/usage?days={days}")
    
    @property
    def analytics(self) -> Analytics:
        return self.Analytics(self)


def create_client(api_key: str, base_url: str = "https://api.example.com") -> CRMClient:
    """Create a CRM client instance"""
    return CRMClient(api_key, base_url)
