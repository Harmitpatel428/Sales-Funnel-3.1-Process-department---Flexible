
import { TestLead, generateTestLeads } from '../utils/test-helpers';

export const TEST_DATA = {
    leads_10: generateTestLeads(10),
    leads_100: generateTestLeads(100),
    leads_500: generateTestLeads(500),
    leads_1000: generateTestLeads(1000),

    files: {
        xlsx: 'e2e/fixtures/leads-100.xlsx',
        xlsx_protected: 'e2e/fixtures/leads-protected.xlsx',
        csv: 'e2e/fixtures/leads.csv',
        invalid: 'e2e/fixtures/invalid.txt'
    },

    passwords: {
        default: 'Admin@123456',
        export: 'export123',
        import: 'test123'
    }
};
