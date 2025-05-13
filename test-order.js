/**
 * Test script for creating an order using the serverless function
 */
const axios = require('axios');

// URL of the netlify function (change to your actual URL)
const FUNCTION_URL = 'http://localhost:8888/.netlify/functions/create-order';

// Sample order for testing
const testOrder = {
  customer_name: "Test Customer",
  items: [
    {
      name: "Rebel Burger",
      quantity: 1,
      modifiers: ["extra cheese"]
    },
    {
      name: "Fries",
      quantity: 2
    }
  ]
};

async function testCreateOrder() {
  console.log('Sending test order to function...');
  console.log(JSON.stringify(testOrder, null, 2));
  
  try {
    const response = await axios.post(FUNCTION_URL, testOrder);
    
    console.log('\nResponse status:', response.status);
    console.log('\nResponse data:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Check if menu prompt is returned
    if (response.data.menu_prompt) {
      console.log('\nMenu prompt received! First 100 characters:');
      console.log(response.data.menu_prompt.substring(0, 100) + '...');
      console.log('\nFull menu prompt saved to menu-prompt.txt');
      
      // Use Node's fs module to write the menu prompt to a file for reference
      require('fs').writeFileSync(
        'menu-prompt.txt', 
        response.data.menu_prompt,
        'utf8'
      );
    }
    
    if (response.data.success) {
      console.log('\n✅ Order created successfully!');
      console.log('Order ID:', response.data.order_id);
    } else {
      console.log('\n❌ Order creation failed:');
      console.log(response.data.error || response.data.message);
    }
  } catch (error) {
    console.error('\n❌ Error calling function:');
    console.error(error.response?.data || error.message);
  }
}

// Run the test
testCreateOrder();
