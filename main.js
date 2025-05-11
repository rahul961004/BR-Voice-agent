// Burger Rebellion Voice Ordering - Main JS with Square MCP Integration
let catalogItems = [];
let squareAccessToken = '';
let locationId = '';

// Hardcoded demo catalog for Burger Rebellion (fallback if API fails)
const demoCatalog = [
  {
    id: 'item_1',
    type: 'ITEM',
    itemData: {
      name: 'Rebel Burger',
      description: 'Classic burger with cheese, lettuce, and special sauce',
      variations: [{ id: 'var_1' }]
    }
  },
  {
    id: 'var_1',
    type: 'ITEM_VARIATION',
    itemVariationData: {
      itemId: 'item_1',
      name: 'Regular',
      priceMoney: { amount: 899, currency: 'USD' }
    }
  },
  {
    id: 'item_2',
    type: 'ITEM',
    itemData: {
      name: 'Fries',
      description: 'Crispy golden fries',
      variations: [{ id: 'var_2' }]
    }
  },
  {
    id: 'var_2',
    type: 'ITEM_VARIATION',
    itemVariationData: {
      itemId: 'item_2',
      name: 'Regular',
      priceMoney: { amount: 399, currency: 'USD' }
    }
  },
  {
    id: 'item_3',
    type: 'ITEM',
    itemData: {
      name: 'Coke',
      description: 'Refreshing cola',
      variations: [{ id: 'var_3' }]
    }
  },
  {
    id: 'var_3',
    type: 'ITEM_VARIATION',
    itemVariationData: {
      itemId: 'item_3',
      name: 'Regular',
      priceMoney: { amount: 299, currency: 'USD' }
    }
  },
  {
    id: 'item_4',
    type: 'ITEM',
    itemData: {
      name: 'Milkshake',
      description: 'Creamy vanilla milkshake',
      variations: [{ id: 'var_4' }]
    }
  },
  {
    id: 'var_4',
    type: 'ITEM_VARIATION',
    itemVariationData: {
      itemId: 'item_4',
      name: 'Regular',
      priceMoney: { amount: 499, currency: 'USD' }
    }
  }
];

// Fetches environment variables from config
async function fetchMCPEnvironment() {
  try {
    // Use hardcoded values from config
    squareAccessToken = "EAAAl5SM50YDIQl1SsC4xJbgqI3t114MBEn02nhI-kzNpBJ7qmHZYCKI0JE_gFNt";
    locationId = "L165PVGQ2WPNG";
    console.log('Environment variables loaded from defaults');
  } catch (error) {
    console.error('Error fetching environment variables:', error);
  }
}

// Initializes catalog items
async function fetchSquareCatalog() {
  try {
    // Use demo catalog for immediate development
    catalogItems = demoCatalog;
    console.log('Demo catalog loaded:', catalogItems.length, 'items');
  } catch (error) {
    console.error('Error fetching catalog:', error);
  }
}

// Matches spoken items to catalog items
function matchOrderItems(orderText) {
  console.log('Matching order:', orderText);
  const orderItems = [];
  const normalizedOrderText = orderText.toLowerCase();
  
  // Extract quantity and item name patterns (e.g., "two burgers", "1 coke")
  const quantityPatterns = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9, '10': 10
  };
  
  for (const item of catalogItems) {
    if (item.type === 'ITEM') {
      const itemName = item.itemData.name.toLowerCase();
      
      // Check if the item name is in the order text
      if (normalizedOrderText.includes(itemName)) {
        let quantity = 1;
        
        // Check for quantities before the item name
        for (const [quantityText, quantityValue] of Object.entries(quantityPatterns)) {
          const quantityPattern = new RegExp(`${quantityText}\\s+${itemName}`, 'i');
          if (quantityPattern.test(normalizedOrderText)) {
            quantity = quantityValue;
            break;
          }
        }
        
        // Get the first variation as default if available
        let variationId = null;
        if (item.itemData.variations && item.itemData.variations.length > 0) {
          variationId = item.itemData.variations[0].id;
        }
        
        // Find any matching variations in the catalog
        for (const catalogEntry of catalogItems) {
          if (catalogEntry.type === 'ITEM_VARIATION' && 
              catalogEntry.itemVariationData && 
              catalogEntry.itemVariationData.itemId === item.id) {
            variationId = catalogEntry.id;
            break;
          }
        }
        
        if (variationId) {
          orderItems.push({
            catalog_object_id: variationId,
            quantity: String(quantity)
          });
        }
      }
    }
  }
  
  console.log('Matched order items:', orderItems);
  return orderItems;
}

// Submits order to Square via MCP
async function submitOrder(orderItems) {
  if (orderItems.length === 0) {
    console.error('No order items to submit');
    return null;
  }
  
  try {
    // Transform items to the format expected by our MCP server
    const formattedItems = orderItems.map(item => ({
      name: item.name || 'Unknown Item',
      quantity: parseInt(item.quantity) || 1,
      modifiers: []
    }));
    
    const orderPayload = {
      customer_name: customerName || 'Unknown Customer',
      items: formattedItems
    };
    
    console.log('Submitting order to MCP server:', orderPayload);
    
    const response = await fetch('http://localhost:5000/api/create_order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    });
    
    const data = await response.json();
    console.log('Order submitted successfully:', data);
    return data;
  } catch (error) {
    console.error('Error submitting order:', error);
    return null;
  }
}

// End the conversation call
async function endConversation() {
  try {
    // For now we don't need to call an external endpoint to end the call
    // The ElevenLabs widget handles this internally
    console.log('Call ended');
  } catch (error) {
    console.error('Error ending call:', error);
  }
}

// Store conversation history to extract order information
let conversationHistory = [];
let customerName = '';

// Process message from ElevenLabs widget
function processWidgetMessage(event) {
  // Filter out react-devtools messages
  if (event.data && event.data.source && event.data.source.includes('react-devtools')) {
    return;
  }
  
  console.log('Received message from widget:', event.data);
  
  // Check for specific message formats from the widget
  if (event.data && event.data.type === 'elevenlabs-convai') {
    const { action, data } = event.data;
    console.log('Received elevenlabs-convai message:', action, data);
    
    // Handle order confirmation action
    if (action === 'order_confirmed' && data && data.orderText) {
      processOrderConfirmation(data.orderText);
    }
    
    // Handle call end action
    if (action === 'session_end' || action === 'end_call') {
      processEndCall();
    }
  }
  
  // Track conversation to extract order details
  if (event.data && event.data.text) {
    const text = event.data.text;
    console.log('Detected text from widget:', text);
    
    // Add to conversation history
    if (event.data.role === 'user') {
      conversationHistory.push({ role: 'user', text: text });
      
      // Check for customer name in the first few messages
      if (conversationHistory.length <= 3 && !customerName) {
        extractCustomerName(text);
      }
    } else {
      conversationHistory.push({ role: 'assistant', text: text });
    }
    
    // Look for confirmation keywords in the text
    if (text.toLowerCase().includes('confirm') || 
        text.toLowerCase().includes('that will be') || 
        text.toLowerCase().includes('your order')) {
      processOrderConfirmation(text);
    }
  }
  
  // If we receive transcription data
  if (event.data && event.data.transcription) {
    console.log('Received transcription:', event.data.transcription);
    conversationHistory.push({ role: 'user', text: event.data.transcription });
  }
}

// Extract customer name from conversation
function extractCustomerName(text) {
  // Simple name extraction - look for common patterns
  const namePatterns = [
    /my name is ([A-Za-z ]+)/i,
    /([A-Za-z ]+) here/i,
    /this is ([A-Za-z ]+)/i,
    /([A-Za-z ]+) speaking/i
  ];
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      customerName = match[1].trim();
      console.log('Extracted customer name:', customerName);
      return;
    }
  }
}

// Process the end of the call
async function processEndCall() {
  console.log('Call ended, extracting order from conversation...');
  
  // Extract items and quantities from the entire conversation
  const extractedOrder = extractOrderFromConversation();
  
  if (extractedOrder.items.length > 0) {
    try {
      // Submit the extracted order to our MCP server
      const response = await fetch('http://localhost:5000/api/create_order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customer_name: customerName || 'Unknown Customer',
          items: extractedOrder.items
        })
      });
      
      const data = await response.json();
      console.log('Order submitted to MCP server:', data);
      
      // Display order confirmation
      const orderInfo = document.getElementById('order-info');
      if (orderInfo && data.order && data.order.id) {
        orderInfo.textContent = `Order for ${customerName || 'Customer'} created! ID: ${data.order.id}`;
        orderInfo.style.display = 'block';
      }
      
      // Reset conversation for next customer
      conversationHistory = [];
      customerName = '';
    } catch (error) {
      console.error('Error submitting order to MCP:', error);
    }
  } else {
    console.log('No order items extracted from conversation');
  }
}

// Extract order details from entire conversation
function extractOrderFromConversation() {
  console.log('Extracting order from conversation history:', conversationHistory);
  
  // Combine all conversation text for analysis
  const fullConversation = conversationHistory.map(entry => entry.text).join(' ');
  
  // Extract order items using various methods
  const itemsFromMatching = matchOrderItems(fullConversation);
  const itemsFromRegex = extractItemsWithRegex(fullConversation);
  
  // Combine all identified items, preferring the more specific matches
  const allItems = [...itemsFromRegex, ...itemsFromMatching];
  
  // Deduplicate items by name (combine quantities)
  const uniqueItems = [];
  const itemMap = new Map();
  
  for (const item of allItems) {
    const normalizedName = item.name.toLowerCase().trim();
    
    if (itemMap.has(normalizedName)) {
      // Update existing item quantity
      const existingItem = itemMap.get(normalizedName);
      existingItem.quantity += (parseInt(item.quantity) || 1);
    } else {
      // Add new item
      itemMap.set(normalizedName, {
        name: item.name,
        quantity: parseInt(item.quantity) || 1,
        modifiers: item.modifiers || []
      });
    }
  }
  
  // Convert map back to array
  itemMap.forEach(item => {
    uniqueItems.push(item);
  });
  
  return {
    customer_name: customerName,
    items: uniqueItems
  };
}

// Extract items using regex patterns
function extractItemsWithRegex(text) {
  const items = [];
  
  // Common menu items with quantity patterns
  const itemPatterns = [
    // Quantity + Item pattern (e.g., "2 burgers" or "one fries")
    /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+([\w\s]+?)(\.|,|and|with|$)/gi,
    // Item + quantity pattern (e.g., "burgers, 2" or "fries one")
    /([\w\s]+?)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(\.|,|and|with|$)/gi
  ];
  
  // Words to number conversion
  const wordToNumber = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
  };
  
  // Process each pattern
  for (const pattern of itemPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let quantity, itemName;
      
      // Check which group contains the quantity vs the item name
      if (match[1].match(/\d+|one|two|three|four|five|six|seven|eight|nine|ten/i)) {
        quantity = match[1].toLowerCase();
        itemName = match[2].trim();
      } else {
        quantity = match[2].toLowerCase();
        itemName = match[1].trim();
      }
      
      // Convert word quantities to numbers
      if (isNaN(quantity)) {
        quantity = wordToNumber[quantity] || 1;
      } else {
        quantity = parseInt(quantity);
      }
      
      // Extract modifiers if any (e.g., "with ketchup")
      const modifierMatch = text.match(new RegExp(`${itemName}\\s+with\\s+([\\w\\s,]+)`, 'i'));
      const modifiers = modifierMatch ? [modifierMatch[1].trim()] : [];
      
      items.push({
        name: itemName,
        quantity: quantity,
        modifiers: modifiers
      });
    }
  }
  
  // Direct menu item detection (for when quantity isn't specified)
  const menuItems = ['burger', 'fries', 'coke', 'milkshake', 'drink', 'coffee', 'soda', 'water'];
  
  for (const item of menuItems) {
    // Skip if we already found this item with quantity
    if (items.some(i => i.name.toLowerCase().includes(item))) {
      continue;
    }
    
    // Check if item is mentioned without quantity
    if (text.toLowerCase().includes(item)) {
      items.push({
        name: item,
        quantity: 1,
        modifiers: []
      });
    }
  }
  
  return items;
}

// Create a test order function for direct testing
async function createTestOrder() {
  // Sample order with common items
  const testOrder = [
    { name: 'Rebel Burger', quantity: 2 },
    { name: 'Fries', quantity: 1 },
    { name: 'Coke', quantity: 1 }
  ];
  
  // Directly submit to Square sandbox via MCP server
  try {
    console.log('Creating test order...');
    const response = await fetch('http://localhost:5000/api/create_order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer_name: 'Test Customer',
        items: testOrder
      })
    });
    
    const data = await response.json();
    console.log('Test order created successfully:', data);
    // Display order ID on the page
    const orderInfo = document.getElementById('order-info');
    if (orderInfo && data.order && data.order.id) {
      orderInfo.textContent = `Order created! ID: ${data.order.id}`;
      orderInfo.style.display = 'block';
    } else {
      // Show response even if no order ID is available
      orderInfo.textContent = `Order submitted: ${JSON.stringify(data).substring(0, 100)}...`;
      orderInfo.style.display = 'block';
    }
    return data;
  } catch (error) {
    console.error('Error creating test order:', error);
    const orderInfo = document.getElementById('order-info');
    if (orderInfo) {
      orderInfo.textContent = `Error creating order: ${error.message}`;
      orderInfo.style.display = 'block';
      orderInfo.style.backgroundColor = '#d32f2f';
    }
    return null;
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Burger Rebellion Voice Ordering initialized');
  
  // Load environment variables and catalog data
  await fetchMCPEnvironment();
  await fetchSquareCatalog();
  
  // Add test order button
  const appContainer = document.querySelector('.burger-logo');
  const testButton = document.createElement('button');
  testButton.textContent = 'Create Test Order';
  testButton.style.padding = '10px 20px';
  testButton.style.backgroundColor = '#d32f2f';
  testButton.style.color = 'white';
  testButton.style.border = 'none';
  testButton.style.borderRadius = '4px';
  testButton.style.cursor = 'pointer';
  testButton.style.marginTop = '20px';
  testButton.addEventListener('click', createTestOrder);
  appContainer.appendChild(testButton);
  
  // Add order info display
  const orderInfo = document.createElement('div');
  orderInfo.id = 'order-info';
  orderInfo.style.marginTop = '10px';
  orderInfo.style.backgroundColor = '#4caf50';
  orderInfo.style.color = 'white';
  orderInfo.style.padding = '10px';
  orderInfo.style.borderRadius = '4px';
  orderInfo.style.display = 'none';
  appContainer.appendChild(orderInfo);
  
  // Set up event listener for ElevenLabs widget
  const widget = document.querySelector('elevenlabs-convai');
  
  if (widget) {
    // Listen for messages from the widget
    window.addEventListener('message', processWidgetMessage);
    
    console.log('ElevenLabs widget initialized and listening for orders');
  } else {
    console.error('ElevenLabs widget not found');
  }
});
