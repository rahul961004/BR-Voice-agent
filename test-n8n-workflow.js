const axios = require('axios');

async function testWorkflow() {
    try {
        // Test list menu webhook endpoint
        console.log('Testing list menu webhook...');
        const menuResponse = await axios.get('http://localhost:8888/.netlify/functions/list_menu?webhook-test=true');        console.log('Menu response:', JSON.stringify(menuResponse.data, null, 2));
        
        if (!menuResponse.data.items || !menuResponse.data.items.length) {
            throw new Error('No menu items received');
        }
        
        // Extract the first menu item for testing
        const testItem = menuResponse.data.items[0];
        console.log('\nTesting order creation...');
        const orderResponse = await axios.post('http://localhost:8888/.netlify/functions/create_order', {
            location_id: process.env.SQUARE_LOCATION_ID,
            items: [testItem]
        });
        console.log('Order response:', JSON.stringify(orderResponse.data, null, 2));

    } catch (error) {
        console.error('Test failed:', error.response?.data || error.message);
    }
}

testWorkflow();
