/**
 * Check the actual schema and data in customers collection
 */

import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

// Admin credentials from environment variables
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function check() {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.error('Error: PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD environment variables must be set');
        process.exit(1);
    }

    // Auth as admin
    await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Get customers collection schema
    console.log('📋 Customers Collection Schema:\n');
    const collection = await pb.collections.getOne('customers');
    console.log('Collection object:', JSON.stringify(collection, null, 2));

    // Get actual customer records with all fields
    console.log('\n📊 Customer Records (raw data):\n');
    const customers = await pb.collection('customers').getFullList();
    for (const c of customers) {
        console.log('Record:', JSON.stringify(c, null, 2));
        console.log('---');
    }
}

check().catch(console.error);
