// Burger Rebellion Voice Ordering - Main Script
document.addEventListener('DOMContentLoaded', async function() {
  // Fetch menu items from Square
  fetchMenuItems();
  
  // Application state
  let customerName = '';
  let orderItems = [];
  let conversationHistory = [];
  let baseApiUrl = '';

  // Determine API base URL based on environment
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    baseApiUrl = 'http://localhost:8888';
  } else {
    // In production, use relative path which will be handled by Netlify redirects
    baseApiUrl = '';
  }
  
  console.log('Using API base URL:', baseApiUrl);

  // Initialize UI elements
  const submitOrderBtn = document.getElementById('submit-order-btn');
  const orderInfo = document.getElementById('order-info');
  const orderSummary = document.getElementById('order-summary');
  const orderItemList = document.getElementById('order-item-list');
  const widgetPlaceholder = document.getElementById('widget-placeholder');

  // Add event listeners
  if (submitOrderBtn) {
    submitOrderBtn.addEventListener('click', handleSubmitOrder);
  }

  // Load the ElevenLabs Widget
  async function loadElevenLabsWidget() {
    // Create script element for the widget
    const script = document.createElement('script');
    script.src = 'https://widget.elevenlabs.io/widget.js';
    script.async = true;
    script.onload = function() {
      console.log('ElevenLabs widget script loaded');
      initializeWidget();
    };
    document.head.appendChild(script);
  }

  // Initialize the ElevenLabs widget
  function initializeWidget() {
    if (typeof ElevenLabsWidget !== 'undefined') {
      console.log('Initializing ElevenLabs widget');
      
      // Create the widget instance
      const widget = ElevenLabsWidget.init({
        voice: "Rachel", // Default voice
        embedded: true,
        element: widgetPlaceholder
      });
      
      // Add event listeners for the widget
      window.addEventListener('message', processWidgetMessage);
      
      console.log('ElevenLabs widget initialized');
    } else {
      console.error('ElevenLabs widget not available');
    }
  }

  // Process messages from the ElevenLabs widget
  function processWidgetMessage(event) {
    try {
      if (event.data && event.data.type) {
        console.log('Widget message received:', event.data.type);
        
        // Handle different message types
        switch (event.data.type) {
          case 'elevenlabs-widget:transcript':
            // Handle transcript (user speech)
            const userMessage = event.data.data.text;
            conversationHistory.push({ role: 'user', content: userMessage });
            console.log('User said:', userMessage);
            
            // Extract customer name if not already known
            if (!customerName) {
              extractCustomerName(userMessage);
            }
            
            // Analyze transcript for order items
            extractOrderItems(userMessage);
            
            // Update the UI with the latest order information
            updateOrderDisplay();
            break;
            
          case 'elevenlabs-widget:response':
            // Handle AI response
            const aiMessage = event.data.data.text;
            conversationHistory.push({ role: 'assistant', content: aiMessage });
            console.log('Assistant said:', aiMessage);
            
            // Look for order confirmation in the AI's response
            if (isOrderConfirmation(aiMessage)) {
              // Enable the submit button when order is confirmed
              if (submitOrderBtn && orderItems.length > 0) {
                submitOrderBtn.disabled = false;
              }
              
              updateOrderDisplay();
            }
            break;
            
          case 'elevenlabs-widget:call-ended':
            // Call has ended
            console.log('Call ended');
            endConversation();
            break;
            
          default:
            console.log('Unhandled widget message type:', event.data.type);
        }
      }
    } catch (error) {
      console.error('Error processing widget message:', error);
    }
  }
  
  // Update the order display with current items
  function updateOrderDisplay() {
    if (!orderSummary || !orderItemList) return;
    
    // Clear previous content
    orderSummary.innerHTML = '';
    orderItemList.innerHTML = '';
    
    if (orderItems.length === 0) {
      // No items yet
      orderSummary.innerHTML = '<p class="no-order">No order detected yet. Please speak to the assistant to place an order.</p>';
      submitOrderBtn.disabled = true;
      return;
    }
    
    // Customer name
    const nameDisplay = document.createElement('p');
    nameDisplay.innerHTML = `<strong>Customer:</strong> ${customerName || 'Unknown Customer'}`;
    orderSummary.appendChild(nameDisplay);
    
    // Total items
    const totalItemsDisplay = document.createElement('p');
    const totalItems = orderItems.reduce((total, item) => total + item.quantity, 0);
    totalItemsDisplay.innerHTML = `<strong>Total Items:</strong> ${totalItems}`;
    orderSummary.appendChild(totalItemsDisplay);
    
    // Display each item
    orderItems.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'order-item';
      
      const itemDetails = document.createElement('div');
      itemDetails.className = 'item-details';
      
      // Item name and quantity
      const itemNameEl = document.createElement('div');
      itemNameEl.innerHTML = `<span class="item-quantity">${item.quantity}x</span>${item.name}`;
      itemDetails.appendChild(itemNameEl);
      
      // Item modifiers if any
      if (item.modifiers && item.modifiers.length > 0) {
        const modifiersEl = document.createElement('div');
        modifiersEl.className = 'item-modifiers';
        modifiersEl.textContent = item.modifiers.join(', ');
        itemDetails.appendChild(modifiersEl);
      }
      
      itemEl.appendChild(itemDetails);
      orderItemList.appendChild(itemEl);
    });
  }

  // Extract customer name from conversation
  function extractCustomerName(text) {
    // Simple pattern matching for name extraction
    // Look for phrases like "my name is [Name]" or "this is [Name]"
    const namePatterns = [
      /my name is ([A-Z][a-z]+ ?[A-Z]?[a-z]*)/i,
      /this is ([A-Z][a-z]+ ?[A-Z]?[a-z]*)/i,
      /([A-Z][a-z]+ ?[A-Z]?[a-z]*) here/i,
      /I'm ([A-Z][a-z]+ ?[A-Z]?[a-z]*)/i
    ];
    
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        customerName = match[1].trim();
        console.log(`Extracted customer name: ${customerName}`);
        return;
      }
    }
  }

  // Extract order items from text
  function extractOrderItems(text) {
    // This is a simplified example - in a real application, 
    // you would use more sophisticated NLP to extract order items
    
    // Look for common phrases indicating items and quantities
    const itemPatterns = [
      { regex: /(\d+)\s*(rebel burger|burger)/gi, name: 'Rebel Burger' },
      { regex: /(\d+)\s*fries/gi, name: 'Fries' },
      { regex: /(\d+)\s*(coke|cola)/gi, name: 'Coke' }
    ];
    
    const modifierPatterns = [
      { regex: /no (onion|cheese|pickle|sauce)/gi, type: 'remove' },
      { regex: /extra (cheese|sauce)/gi, type: 'add' }
    ];
    
    // Find items and their quantities
    for (const pattern of itemPatterns) {
      const matches = [...text.matchAll(pattern.regex)];
      for (const match of matches) {
        const quantity = parseInt(match[1]) || 1;
        const name = pattern.name;
        
        // Check if this item is already in the order
        const existingItem = orderItems.find(item => item.name === name);
        if (existingItem) {
          existingItem.quantity += quantity;
        } else {
          orderItems.push({
            name,
            quantity,
            modifiers: []
          });
        }
      }
    }
    
    // Find modifiers and apply to the most recently mentioned item
    if (orderItems.length > 0) {
      const latestItem = orderItems[orderItems.length - 1];
      
      for (const pattern of modifierPatterns) {
        const matches = [...text.matchAll(pattern.regex)];
        for (const match of matches) {
          const modifier = `${pattern.type === 'remove' ? 'No' : 'Extra'} ${match[1]}`;
          if (!latestItem.modifiers.includes(modifier)) {
            latestItem.modifiers.push(modifier);
          }
        }
      }
    }
    
    console.log('Current order items:', orderItems);
  }

  // Check if the AI's response is confirming the order
  function isOrderConfirmation(text) {
    const confirmationPhrases = [
      /confirm.*order/i,
      /place.*order/i,
      /submit.*order/i,
      /send.*order/i,
      /process.*order/i
    ];
    
    return confirmationPhrases.some(phrase => phrase.test(text));
  }

  // Handle submit order button click - Send extracted data to Square
  async function handleSubmitOrder() {
    if (orderItems.length === 0) {
      console.log('No items to order');
      
      if (orderInfo) {
        orderInfo.textContent = 'No items to order. Please speak to the assistant first.';
        orderInfo.style.display = 'block';
        orderInfo.style.backgroundColor = '#ffebee';
      }
      
      return;
    }
    
    console.log(`Submitting order for ${customerName || 'Customer'}:`, orderItems);
    
    // Show processing state
    if (submitOrderBtn) {
      submitOrderBtn.disabled = true;
      submitOrderBtn.textContent = 'Processing...';
    }
    
    if (orderInfo) {
      orderInfo.textContent = 'Processing order...';
      orderInfo.style.display = 'block';
      orderInfo.style.backgroundColor = '#e3f2fd';
    }
    
    // Format items for submission
    const formattedItems = orderItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      modifiers: item.modifiers
    }));
    
    // Submit the order
    try {
      const orderResponse = await submitOrder(formattedItems);
      
      if (orderResponse) {
        // Display order confirmation
        if (orderInfo) {
          const orderId = orderResponse.order?.id || orderResponse.id || '';
          orderInfo.textContent = `Order submitted successfully! ${orderId ? `Order ID: ${orderId}` : ''}`;
          orderInfo.style.display = 'block';
          orderInfo.style.backgroundColor = '#e8f5e9';
        }
        
        // Reset the order after successful submission
        orderItems = [];
        updateOrderDisplay();
      }
    } catch (error) {
      console.error('Error submitting order:', error);
      
      if (orderInfo) {
        orderInfo.textContent = `Error submitting order: ${error.message}`;
        orderInfo.style.display = 'block';
        orderInfo.style.backgroundColor = '#ffebee';
      }
    } finally {
      // Reset button state
      if (submitOrderBtn) {
        submitOrderBtn.textContent = 'Submit Order to Square';
        submitOrderBtn.disabled = orderItems.length === 0;
      }
    }
  }

  // Submits order to Square via Netlify function
  async function submitOrder(orderItems) {
    if (orderItems.length === 0) {
      console.error('No order items to submit');
      return null;
    }
    
    try {
      // Prepare data for the serverless function
      const orderPayload = {
        customer_name: customerName || 'Unknown Customer',
        items: orderItems
      };
      
      console.log('Submitting order to serverless function:', orderPayload);
      
      const response = await fetch(`${baseApiUrl}/api/create-order`, {
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
      
      if (orderInfo) {
        orderInfo.textContent = `Error creating order: ${error.message}`;
        orderInfo.style.display = 'block';
        orderInfo.style.backgroundColor = '#ffebee';
      }
      
      return null;
    }
  }

  // End the conversation call
  async function endConversation() {
    try {
      console.log('Call ended');
    } catch (error) {
      console.error('Error ending call:', error);
    }
  }

  // Create a test order function for direct testing
  async function createTestOrder() {
    // Sample order with common items
    const testOrder = [
      { name: 'Rebel Burger', quantity: 2, modifiers: ['Extra cheese'] },
      { name: 'Fries', quantity: 1, modifiers: [] },
      { name: 'Coke', quantity: 1, modifiers: ['No ice'] }
    ];
    
    // Directly submit to serverless function
    try {
      console.log('Creating test order...');
      // Use the Netlify function path format
      const response = await fetch(`${baseApiUrl}/.netlify/functions/create-order`, {
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
      if (orderInfo) {
        if (data.order && data.order.id) {
          orderInfo.textContent = `Order created! ID: ${data.order.id}`;
        } else {
          // Show response even if no order ID is available
          orderInfo.textContent = `Order submitted: ${JSON.stringify(data).substring(0, 100)}...`;
        }
        orderInfo.style.display = 'block';
        orderInfo.style.backgroundColor = '#e8f5e9';
      }
      
      return data;
    } catch (error) {
      console.error('Error creating test order:', error);
      
      if (orderInfo) {
        orderInfo.textContent = `Error creating order: ${error.message}`;
        orderInfo.style.display = 'block';
        orderInfo.style.backgroundColor = '#ffebee';
      }
      
      return null;
    }
  }

  // Fetch menu items from Square API
  async function fetchMenuItems() {
    try {
      console.log('Fetching menu items from Square...');
      const response = await fetch('/.netlify/functions/list_menu');
      const menuItems = await response.json();
      
      if (menuItems && menuItems.length > 0) {
        console.log('Menu items loaded:', menuItems);
        displayMenuItems(menuItems);
      } else {
        console.error('Error loading menu items: No items found');
      }
    } catch (error) {
      console.error('Failed to fetch menu:', error);
    }
  }

  // Display menu items in the UI
  function displayMenuItems(menuItems) {
    const menuContainer = document.getElementById('menu-container');
    if (!menuContainer) return;
    
    menuContainer.innerHTML = '';
    
    // Create menu header
    const menuHeader = document.createElement('h3');
    menuHeader.textContent = 'Menu Items';
    menuContainer.appendChild(menuHeader);
    
    // Create menu item grid
    const menuGrid = document.createElement('div');
    menuGrid.className = 'menu-grid';
    
    menuItems.forEach(item => {
      const menuItemEl = document.createElement('div');
      menuItemEl.className = 'menu-item';
      
      const itemName = document.createElement('h4');
      itemName.textContent = item.name;
      menuItemEl.appendChild(itemName);
      
      if (item.description) {
        const itemDesc = document.createElement('p');
        itemDesc.className = 'menu-item-desc';
        itemDesc.textContent = item.description;
        menuItemEl.appendChild(itemDesc);
      }
      
      const itemPrice = document.createElement('p');
      itemPrice.className = 'menu-item-price';
      itemPrice.textContent = `$${(item.price/100).toFixed(2)} ${item.currency}`;
      menuItemEl.appendChild(itemPrice);
      
      menuGrid.appendChild(menuItemEl);
    });
    
    menuContainer.appendChild(menuGrid);
  }

  // Initialize the application
  async function init() {
    console.log('Initializing Burger Rebellion Voice Ordering app');
    loadElevenLabsWidget();
    await fetchMenuItems();
  }

  // Start the application
  init();
});
