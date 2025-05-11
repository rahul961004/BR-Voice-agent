# ElevenLabs Agent Configuration Guide

## Overview

This guide explains how to configure your ElevenLabs Conversational Agent to capture the right information for Square orders through our MCP middleware.

## Required Agent Configuration

When setting up your ElevenLabs agent (ID: U95ETaD2JpoAJTDuMHQT), ensure it follows these guidelines:

### 1. Capture Order Information

The agent should be instructed to:

- Greet the customer and present them with menu options
- Accurately capture item names exactly as they appear in Square catalog
- Confirm quantities for each item
- Ask if the customer wants to add more items
- Summarize the complete order before confirming

### 2. Order Confirmation Format

The agent **MUST** use specific language to trigger our order processing:

- When confirming the order, include the phrase "I confirm your order of [items]"
- Example: "Great! I confirm your order of 2 Rebel Burgers and 1 Coke. Your order will be ready shortly."

### 3. Data Transfer Format

Our JavaScript listens for messages from the widget in this format:

```javascript
{
  type: "elevenlabs-convai",
  action: "order_confirmed",
  data: {
    orderText: "2 Rebel Burgers and 1 Coke"
  }
}
```

Alternatively, our code also captures messages that include the word "confirm" in the text field.

### 4. Session End

After confirming the order, the agent should:

1. Thank the customer
2. Let them know their order will be ready shortly
3. End the conversation

## Testing Agent Behavior

To verify your agent is correctly configured:

1. Open the web app
2. Place a test order
3. Check the browser console to see if order items are correctly matched
4. Verify the order is submitted to Square
5. Confirm the conversation ends properly

## Troubleshooting

If orders aren't being processed:

1. Check the browser console for errors
2. Ensure the agent is using the exact menu item names from Square catalog
3. Verify the confirmation phrases include the word "confirm"
4. Make sure the MCP server is running and can connect to Square API
