// Burger Rebellion Voice Ordering - Main Script
document.addEventListener('DOMContentLoaded', async function() {
  // Application state
  let customerName = '';
  let orderItems = [];
  let conversationHistory = [];
  let baseApiUrl = '';

  // Determine API base URL - use relative URL in production, absolute in development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    baseApiUrl = 'http://localhost:8888';
  } else {
    // In production, use relative path which will be handled by Netlify redirects
    baseApiUrl = '';
  }

  // Initialize UI elements
  const testOrderBtn = document.getElementById('test-order-btn');
  const orderInfo = document.getElementById('order-info');
  const widgetPlaceholder = document.getElementById('widget-placeholder');

  // Add event listeners
  if (testOrderBtn) {
    testOrderBtn.addEventListener('click', createTestOrder);
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
            break;
            
          case 'elevenlabs-widget:response':
            // Handle AI response
            const aiMessage = event.data.data.text;
            conversationHistory.push({ role: 'assistant', content: aiMessage });
            console.log('Assistant said:', aiMessage);
            
            // Look for order confirmation in the AI's response
            if (isOrderConfirmation(aiMessage)) {
              handleOrderConfirmation();
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

  // Handle order confirmation - Submit the order to Square
  async function handleOrderConfirmation() {
    if (orderItems.length === 0) {
      console.log('No items to order');
      return;
    }
    
    console.log(`Confirming order for ${customerName || 'Customer'}:`, orderItems);
    
    // Format items for submission
    const formattedItems = orderItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      modifiers: item.modifiers
    }));
    
    // Submit the order
    const orderResponse = await submitOrder(formattedItems);
    
    if (orderResponse) {
      // Display order confirmation
      if (orderInfo) {
        orderInfo.textContent = `Order submitted! ${orderResponse.order ? `Order ID: ${orderResponse.order.id}` : ''}`;
        orderInfo.style.display = 'block';
        orderInfo.style.backgroundColor = '#e8f5e9';
      }
      
      // Reset the order after successful submission
      orderItems = [];
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
      const response = await fetch(`${baseApiUrl}/api/create-order`, {
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

  // Initialize the application
  async function init() {
    console.log('Initializing Burger Rebellion Voice Ordering app');
    loadElevenLabsWidget();
  }

  // Start the application
  init();
});
