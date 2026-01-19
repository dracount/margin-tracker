import PocketBase from 'pocketbase';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pb = new PocketBase('http://127.0.0.1:8090');

// Column mapping from CSV headers to schema
const COLUMN_MAP = {
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

function normalizeHeader(header) {
    return header.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseNumber(value) {
    if (!value || value.trim() === '') return 0;
    // Remove currency symbols, spaces, and handle comma as decimal
    const cleaned = value.replace(/[R\s]/g, '').replace(/,/g, '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

function parseCSV(content) {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // Parse header - tab separated
    const headers = lines[0].split('\t').map(h => h.trim());
    console.log('CSV Headers found:', headers.slice(0, 15));

    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('\t');
        const row = {};

        headers.forEach((header, index) => {
            row[header] = values[index]?.trim() || '';
        });

        rows.push(row);
    }

    return rows;
}

function mapRowToStyle(row, customerId) {
    const mapped = {
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
    console.log('=== CLEAR AND RESEED DATABASE ===\n');

    // Authenticate as admin
    try {
        await pb.admins.authWithPassword('admin@margin.local', 'admin123');
        console.log('Authenticated as admin\n');
    } catch (err) {
        console.error('Admin auth failed:', err);
        process.exit(1);
    }

    // 1. Get customer
    console.log('Finding customer: PEEP & HEY BETTY');
    let customer;
    try {
        const existing = await pb.collection('customers').getList(1, 1, {
            filter: 'name = "PEEP & HEY BETTY"'
        });

        if (existing.items.length > 0) {
            customer = existing.items[0];
            console.log('Found customer:', customer.id);
        } else {
            customer = await pb.collection('customers').create({
                name: 'PEEP & HEY BETTY',
                customer_id: 'PEEP-HB-001'
            });
            console.log('Created customer:', customer.id);
        }
    } catch (err) {
        console.error('Error with customer:', err);
        process.exit(1);
    }

    // 2. DELETE ALL existing styles for this customer
    console.log('\nDeleting all existing styles...');
    try {
        const allStyles = await pb.collection('styles').getFullList({
            filter: `customer = "${customer.id}"`
        });
        console.log(`Found ${allStyles.length} styles to delete`);

        for (const style of allStyles) {
            await pb.collection('styles').delete(style.id);
        }
        console.log('All styles deleted');
    } catch (err) {
        console.error('Error deleting styles:', err.message || err);
    }

    // 3. Read and parse CSV
    const csvPath = path.join(__dirname, '../uploads/1.csv');
    console.log('\nReading CSV from:', csvPath);

    let csvContent;
    try {
        csvContent = fs.readFileSync(csvPath, 'utf-8');
    } catch (err) {
        console.error('Error reading CSV:', err);
        process.exit(1);
    }

    const rows = parseCSV(csvContent);
    console.log(`Found ${rows.length} rows in CSV\n`);

    // Debug: Show first row mapping
    if (rows.length > 0) {
        const firstDataRow = rows.find(r => r['Style #'] && r['Style #'].trim() !== '');
        if (firstDataRow) {
            console.log('Sample row from CSV:');
            console.log('  Style #:', firstDataRow['Style #']);
            console.log('  Units:', firstDataRow['Units']);
            console.log('  Price:', firstDataRow['Price']);
            console.log('  Rate:', firstDataRow['Rate']);
            console.log('  Actual Selling Price:', firstDataRow['Actual Selling Price']);

            const mapped = mapRowToStyle(firstDataRow, customer.id);
            console.log('\nMapped to:');
            console.log('  styleId:', mapped.styleId);
            console.log('  units:', mapped.units);
            console.log('  price:', mapped.price);
            console.log('  rate:', mapped.rate);
            console.log('  sellingPrice:', mapped.sellingPrice);
            console.log('');
        }
    }

    // 4. Import styles
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
        const style = mapRowToStyle(row, customer.id);

        // Skip rows without styleId or with invalid styleId
        if (!style.styleId || style.styleId.trim() === '' || style.styleId === '0') {
            skipped++;
            continue;
        }

        try {
            await pb.collection('styles').create(style);
            imported++;
            process.stdout.write(`\rImported: ${imported} | Skipped: ${skipped} | Errors: ${errors}`);
        } catch (err) {
            errors++;
            console.error(`\nError importing ${style.styleId}:`, err.message || err);
        }
    }

    console.log('\n\n=== IMPORT COMPLETE ===');
    console.log(`  Imported: ${imported}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);
}

main().catch(console.error);
