import PocketBase from 'pocketbase';
import * as fs from 'fs';
import * as path from 'path';

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

// Column mapping from CSV headers to schema
const COLUMN_MAP: Record<string, string> = {
    'style #': 'styleId',
    'style': 'styleId',
    'factory': 'factory',
    'cust del': 'deliveryDate',
    'description': 'description',
    'fabric/ trim': 'fabricTrim',
    'fabric/trim': 'fabricTrim',
    'type': 'type',
    'units': 'units',
    'pack': 'pack',
    'price': 'price',
    'rate': 'rate',
    'extra cost': 'extraCost',
    'actual selling price': 'sellingPrice',
};

function normalizeHeader(header: string): string {
    return header.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseNumber(value: string): number {
    if (!value || value.trim() === '') return 0;
    // Remove currency symbols, spaces, and handle comma as decimal
    const cleaned = value.replace(/[R\s]/g, '').replace(/,/g, '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

function parseCSV(content: string): Record<string, string>[] {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // Parse header - tab separated
    const headers = lines[0].split('\t').map(h => h.trim());

    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('\t');
        const row: Record<string, string> = {};

        headers.forEach((header, index) => {
            row[header] = values[index]?.trim() || '';
        });

        rows.push(row);
    }

    return rows;
}

function mapRowToStyle(row: Record<string, string>, customerId: string) {
    const mapped: Record<string, unknown> = {
        customer: customerId,
        styleId: '',
        factory: '',
        deliveryDate: '',
        description: '',
        fabricTrim: '',
        type: '',
        units: 0,
        pack: 0,
        price: 0,
        rate: 0,
        extraCost: 0,
        sellingPrice: 0,
    };

    for (const [header, value] of Object.entries(row)) {
        const normalizedHeader = normalizeHeader(header);
        const schemaKey = COLUMN_MAP[normalizedHeader];

        if (schemaKey) {
            if (['units', 'pack', 'price', 'rate', 'extraCost', 'sellingPrice'].includes(schemaKey)) {
                mapped[schemaKey] = parseNumber(value);
            } else {
                mapped[schemaKey] = value || '';
            }
        }
    }

    return mapped;
}

async function main() {
    console.log('Starting data seed...\n');

    // Check if admin credentials are needed
    const adminEmail = process.env.PB_ADMIN_EMAIL;
    const adminPassword = process.env.PB_ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
        try {
            await pb.admins.authWithPassword(adminEmail, adminPassword);
            console.log('Authenticated as admin');
        } catch (err) {
            console.error('Admin auth failed:', err);
        }
    }

    // 1. Create customer
    console.log('Creating customer: PEEP & HEY BETTY');
    let customer;

    try {
        // Check if customer already exists
        const existing = await pb.collection('customers').getList(1, 1, {
            filter: 'name = "PEEP & HEY BETTY"'
        });

        if (existing.items.length > 0) {
            customer = existing.items[0];
            console.log('Customer already exists, using existing:', customer.id);
        } else {
            customer = await pb.collection('customers').create({
                name: 'PEEP & HEY BETTY',
                customer_id: 'PEEP-HB-001'
            });
            console.log('Customer created:', customer.id);
        }
    } catch (err) {
        console.error('Error creating customer:', err);
        process.exit(1);
    }

    // 2. Read and parse CSV
    const csvPath = path.join(__dirname, '../uploads/1.csv');
    console.log('\nReading CSV from:', csvPath);

    let csvContent: string;
    try {
        csvContent = fs.readFileSync(csvPath, 'utf-8');
    } catch (err) {
        console.error('Error reading CSV:', err);
        process.exit(1);
    }

    const rows = parseCSV(csvContent);
    console.log(`Found ${rows.length} rows in CSV\n`);

    // 3. Import styles
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
        const style = mapRowToStyle(row, customer.id);

        // Skip rows without styleId
        if (!style.styleId || String(style.styleId).trim() === '' || String(style.styleId) === '0') {
            skipped++;
            continue;
        }

        try {
            await pb.collection('styles').create(style);
            imported++;
            process.stdout.write(`\rImported: ${imported} | Skipped: ${skipped} | Errors: ${errors}`);
        } catch (err) {
            errors++;
            console.error(`\nError importing ${style.styleId}:`, err);
        }
    }

    console.log('\n\nImport complete!');
    console.log(`  Imported: ${imported}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);
}

main().catch(console.error);
