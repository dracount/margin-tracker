/**
 * PocketBase Database Seed Script
 * 
 * This script creates the required collections and inserts sample data.
 * Run with: node scripts/seed-db.js
 * 
 * Prerequisites:
 * - PocketBase must be running at http://localhost:8090
 * - You must have created a superuser account
 */

import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

// Admin credentials from environment variables
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function seed() {
    console.log('🌱 Starting database seed...\n');

    // Check for required credentials
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.error('❌ Error: PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD environment variables must be set');
        process.exit(1);
    }

    // Authenticate as admin
    console.log('🔐 Authenticating as admin...');
    try {
        await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('✅ Authenticated successfully\n');
    } catch (err) {
        console.error('❌ Failed to authenticate:', err.message);
        console.log('\nMake sure:');
        console.log(`1. PocketBase is running at ${process.env.POCKETBASE_URL || 'http://localhost:8090'}`);
        console.log('2. PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD environment variables are correct');
        process.exit(1);
    }

    // Create customers collection
    console.log('📦 Creating customers collection...');
    try {
        await pb.collections.create({
            name: 'customers',
            type: 'base',
            fields: [
                { name: 'name', type: 'text', required: true },
                { name: 'customer_id', type: 'text', required: true },
                { name: 'logo', type: 'file', maxSelect: 1, maxSize: 5242880 }
            ],
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule: '@request.auth.id != ""',
            updateRule: '@request.auth.id != ""',
            deleteRule: '@request.auth.id != ""',
        });
        console.log('✅ customers collection created\n');
    } catch (err) {
        if (err.message?.includes('already exists')) {
            console.log('ℹ️  customers collection already exists\n');
        } else {
            console.error('❌ Failed to create customers collection:', err.message);
        }
    }

    // Get the customers collection ID for the relation
    let customersCollectionId;
    try {
        const customersCol = await pb.collections.getOne('customers');
        customersCollectionId = customersCol.id;
    } catch (err) {
        console.error('❌ Failed to get customers collection ID:', err.message);
        process.exit(1);
    }

    // Create styles collection
    console.log('📦 Creating styles collection...');
    try {
        await pb.collections.create({
            name: 'styles',
            type: 'base',
            fields: [
                { name: 'customer', type: 'relation', required: true, collectionId: customersCollectionId, cascadeDelete: false, maxSelect: 1 },
                { name: 'styleId', type: 'text', required: true },
                { name: 'factory', type: 'text' },
                { name: 'deliveryDate', type: 'text' },
                { name: 'description', type: 'text' },
                { name: 'fabricTrim', type: 'text' },
                { name: 'type', type: 'text' },
                { name: 'units', type: 'number' },
                { name: 'pack', type: 'number' },
                { name: 'price', type: 'number' },
                { name: 'rate', type: 'number' },
                { name: 'extraCost', type: 'number' },
                { name: 'sellingPrice', type: 'number' },
            ],
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule: '@request.auth.id != ""',
            updateRule: '@request.auth.id != ""',
            deleteRule: '@request.auth.id != ""',
        });
        console.log('✅ styles collection created\n');
    } catch (err) {
        if (err.message?.includes('already exists')) {
            console.log('ℹ️  styles collection already exists\n');
        } else {
            console.error('❌ Failed to create styles collection:', err.message);
        }
    }

    // Create sample customer
    console.log('👤 Creating sample customer...');
    let customerId;
    try {
        const customer = await pb.collection('customers').create({
            name: 'PEEP & HEY BETTY',
            customer_id: 'PHB001',
        });
        customerId = customer.id;
        console.log(`✅ Customer created with ID: ${customerId}\n`);
    } catch (err) {
        if (err.message?.includes('already exists')) {
            console.log('ℹ️  Customer already exists, fetching...');
            const existing = await pb.collection('customers').getFirstListItem('customer_id="PHB001"');
            customerId = existing.id;
            console.log(`ℹ️  Using existing customer ID: ${customerId}\n`);
        } else {
            console.error('❌ Failed to create customer:', err.message);
            process.exit(1);
        }
    }

    // Sample data from the spreadsheet
    const sampleStyles = [
        {
            customer: customerId,
            styleId: 'TP131',
            factory: 'YZM',
            deliveryDate: '04-May-20',
            description: 'Cerise & ink t shirt long line',
            fabricTrim: 't-shirt bra',
            type: 'Lace & mesh',
            units: 1500,
            pack: 2,
            price: 13.95,
            rate: 42.00,
            extraCost: 23.00,
            sellingPrice: 129.50,
        },
        {
            customer: customerId,
            styleId: 'TP132',
            factory: 'YZM',
            deliveryDate: '04-May-20',
            description: 'Cerise & ink & periwinkle',
            fabricTrim: 'Thong',
            type: 'lace & mesh',
            units: 1500,
            pack: 3,
            price: 6.45,
            rate: 42.00,
            extraCost: 23.00,
            sellingPrice: 89.50,
        },
    ];

    // Insert sample styles
    console.log('📊 Inserting sample styles...');
    for (const style of sampleStyles) {
        try {
            await pb.collection('styles').create(style);
            console.log(`✅ Created style: ${style.styleId}`);
        } catch (err) {
            if (err.message?.includes('already exists')) {
                console.log(`ℹ️  Style ${style.styleId} already exists`);
            } else {
                console.error(`❌ Failed to create style ${style.styleId}:`, err.message);
            }
        }
    }

    console.log('\n🎉 Database seed completed!');
    console.log('\nYou can now:');
    console.log('1. Log into the Margin Tracker app at http://localhost:5173');
    console.log('2. Use the email and password you created in PocketBase users collection');
}

seed().catch(console.error);
