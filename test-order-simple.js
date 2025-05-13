/**
 * Simplified test script for creating an order
 */
const axios = require('axios');

// Function URL - CHANGE THIS to your Netlify URL
const FUNCTION_URL = 'https://brvoiceaigent.netlify.app/.netlify/functions/create-order';

// Sample order data
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

// Run the test
async function runTest() {
  console.log('Sending test order to:', FUNCTION_URL);
  console.log('Order data:', JSON.stringify(testOrder, null, 2));
  
  try {
    console.log('\nSending request...');
    const response = await axios.post(FUNCTION_URL, testOrder);
    
    console.log('\nResponse received:', response.status);
    console.log(JSON.stringify(response.data, null, 2));
    
    // Show a shorter version of the menu prompt if present
    if (response.data.menu_prompt) {
      const shortPrompt = response.data.menu_prompt.substring(0, 200) + '...';
      console.log('\nMenu prompt preview:', shortPrompt);
    }
  } catch (error) {
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

runTest();
