/**
 * Check the actual schema and data in customers collection
 */

import PocketBase from 'pocketbase';

const pb = new PocketBase('http://localhost:8090');

async function check() {
    // Auth as admin
    await pb.collection('_superusers').authWithPassword('admin@admin.com', 'password');

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
