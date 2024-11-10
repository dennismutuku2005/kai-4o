require('dotenv').config(); // Load environment variables
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
});

// Define a User schema with TTL (3 days) for user data
const userSchema = new mongoose.Schema({
    phoneNumber: String, // Store user's phone number
    name: String, // Store user's name
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 259200 // 3 days in seconds (TTL)
    }
});

const User = mongoose.model('User', userSchema);

// Define a Conversation schema with TTL (4 days) for conversations
const conversationSchema = new mongoose.Schema({
    user: String, // Store user's phone number or ID
    messages: [{
        type: String // Store conversation messages
    }],
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 345600 // 4 days in seconds (TTL)
    }
});

const Conversation = mongoose.model('Conversation', conversationSchema);

// Maurine-4o's personal data model
const personalData = {
    fullName: "Maurine Mwendwa",
    hobbies: [
        "Networking",
        "Coding",
        "Reading",
        "Playing Chess"
    ],
    personality: {
        traits: [
            "Friendly",
            "Creative",
            "Supportive",
            "Tech-savvy",
            "Curious"
        ],
    },
    contact: {
        phoneNumber: "+254700000000", // Replace with Maurine's phone number
    },
    botName: "Maurine-4o",
};

// WhatsApp Client setup
const client = new Client({
    authStrategy: new LocalAuth()
});

// GoogleGenerativeAI setup
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// QR code generation event for WhatsApp connection
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR Code generated. Scan it with your WhatsApp app.');
});

// Client ready event
client.on('ready', () => {
    console.log('Maurine-4o is ready!');
});

// Function to create Maurine-4o response based on Maurine's data and conversation strategy
async function generateMaurine4oReply(message, user, userName, previousMessages) {
    let introductionMessage = `Hi! I'm ${personalData.botName}, an AI created to chat and be a good friend. 😊 What do you enjoy doing in your free time?`;

    // If the user is Maurine, respond accordingly
    if (user === personalData.contact.phoneNumber) {
        return `Hello, Maurine! How can I assist you today?`;
    }

    // For first message from a new user
    if (!message) {
        return introductionMessage;
    }

    // Constructing the prompt with previous messages for context
    const context = previousMessages.join('\n') + `\nUser: ${message}`;
    
    const prompt = `
        You are ${personalData.botName}, a friendly AI assisting users. 
        Don't ask too many questions. Keep it friendly, conversational, and engaging.
        Use the user's name if known: ${userName}.

        Here is the conversation context:
        ${context}
    `;

    try {
        const result = await model.generateContent([prompt]);
        return result.response.text() || 'Sorry, I couldn’t find a response for that.';
    } catch (error) {
        console.error('Error fetching response from Gemini API:', error);
        return 'Sorry, I encountered an error while processing your request.';
    }
}

// Store user information and conversation in MongoDB, and reply
async function handleUserMessage(user, message) {
    // Find or create user entry
    let userEntry = await User.findOne({ phoneNumber: user });
    if (!userEntry) {
        userEntry = new User({ phoneNumber: user });
        await userEntry.save();
    }

    // Ask for the user's name if not already stored
    if (!userEntry.name) {
        userEntry.name = message; // Assume the first message is the user's name
        await userEntry.save();
        return `Got it! Nice to meet you, ${userEntry.name}! What would you like to talk about?`;
    }

    // Retrieve existing conversation or create a new one
    let userConversation = await Conversation.findOne({ user });
    if (!userConversation) {
        userConversation = new Conversation({ user, messages: [] });
    }

    // Store the user's message in conversation history
    userConversation.messages.push(`User: ${message}`);

    // Generate reply based on previous conversation context
    const replyMessage = await generateMaurine4oReply(message, user, userEntry.name, userConversation.messages);
    userConversation.messages.push(`${replyMessage}`);
    await userConversation.save();

    return replyMessage;
}

// Event listener for incoming WhatsApp messages
client.on('message', async (message) => {
    console.log('MESSAGE RECEIVED:', message.body);

    if (message.from.includes('@g.us')) {
        console.log('Ignoring group message.');
        return;
    }

    // Check if the message has a quoted message and handle accordingly
    if (message.hasQuotedMsg) {
        try {
            const quotedMessage = await message.getQuotedMessage();
            console.log('Quoted message:', quotedMessage.body);
        } catch (error) {
            console.error('Error fetching quoted message:', error);
        }
    }

    const user = message.from;
    const replyMessage = await handleUserMessage(user, message.body);
    message.reply(replyMessage);
});

// Initialize the WhatsApp client
client.initialize();
