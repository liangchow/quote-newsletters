const express = require('express')
require('dotenv').config()
const nodemailer = require('nodemailer')
const path = require('path')
const hbs = require('nodemailer-express-handlebars').default
const Queue = require('bull')
const cron = require('node-cron')
const { db } = require('./firebase')
const { FieldValue } = require('firebase-admin/firestore')

const app = express()
// const client = createClient() // unused for now
const PORT = process.env.PORT || 1339
const { EMAIL_USER, EMAIL_PASS, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env
const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true'

// Middleware
app.use(express.json({limit: '10kb'})) // Limit payload size for security
app.use(express.static('public'))

// Utility functions
function trimInput(input){
    if (typeof input !== 'string') return ''
    return input.trim().replace(/[<>]/g, '')
}

function getRandomInteger(min, max){
    min = Math.ceil(min)
    max = Math.floor(max)
    return Math.floor(Math.random() * (max-min+1)) + min
}

// Routes
app.post('/signup', async (req, res) => {
    try {
        // Safety clause
        const rawEmail = req.body?.email || ''
        const newEmail = trimInput(rawEmail).toLowerCase()

        if (!newEmail){
            return res.status(400).json({ message: 'Email required' })
        }

        // Email verification, e.g., j.doe@example.com
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(newEmail)){
                return res.status(400).json({ message: 'Invalid email format' })
            }

        // Check if email already exists and is active
        const userDoc = await db.collection('users').doc(newEmail).get()
        if (userDoc.exists && userDoc.data().active === true){
            return res.status(400).json({message: "You're already subscribed"})
        }

        await db.collection('users').doc(newEmail).set({ 
            email: newEmail,
            subscribedAt: FieldValue.serverTimestamp(),
            active: true, 
         }, { merge: true })

         // Send success response
         res.status(200).json({
            message: "Successfully subscribed",
            email: newEmail,
         })

    } catch (err) {
        console.log('Error: ', err)
        res.status(500).json({ message: 'Failed to register' })
    }
})

app.post('/submit', async (req, res) => {
    try {
        // Safety clause
        const rawText = req.body?.text || ''
        const rawAuthor = req.body?.author || ''
        const rawArea = req.body?.area || ''

        const newText = trimInput(rawText)
        const newAuthor = trimInput(rawAuthor)
        const newArea = trimInput(rawArea)

        if (!newText || !newAuthor || !newArea){
            return res.status(400).json({ message: 'Input required' })
        }

        // Indexing quote
        const snapshot = await db.collection('quotes').orderBy('index', 'desc').limit(1).get()
        let newIndex = 1

        if (!snapshot.empty) {
            const lastDoc = snapshot.docs[0]
            const lastData = lastDoc.data()
            if (typeof lastData.index === 'number') {
                newIndex = lastData.index + 1
            }
        }

        await db.collection('quotes').add({
            index: newIndex,
            text: newText,
            author: newAuthor,
            area: newArea,
            submittedAt: FieldValue.serverTimestamp(),
            approved: false
        })

         // Send success response
         res.status(200).json({
            message: "Successfully submitted",
            index: newIndex,
            text: newText,
            author: newAuthor,
            area: newArea,
         })

    } catch (err) {
        console.log('Error: ', err)
        res.status(500).json({ message: 'Failed to submit' })
    }
})

app.get('/get_random_quote', async (req, res) => {
    try {
        const snapshot = await db.collection('quotes').orderBy('index', 'desc').limit(1).get()
        let targetIndex;

        if (!snapshot.empty) {
            const lastData = snapshot.docs[0].data()
            if (typeof lastData.index === 'number'){
                const lastIndex = lastData.index
                targetIndex = getRandomInteger(1, lastIndex)
                console.log("Random index is: ", targetIndex)
            }
        } else {
            return res.status(500).json({message: 'Index not in db.'})
        }

        // Try to find an approved quote with index >= targetIndex
        // We fetch a batch of quotes starting from targetIndex and filter for 'approved' in memory
        // to avoid needing a composite index on (approved, index).
        let querySnapshot = await db.collection('quotes')
            .orderBy('index')
            .startAt(targetIndex)
            .limit(20)
            .get()

        let validQuote = null;

        const findValidQuote = (snapshot) => {
            for (const doc of snapshot.docs) {
                const data = doc.data();
                if (data.approved === true) {
                    return { id: doc.id, ...data };
                }
            }
            return null;
        }

        validQuote = findValidQuote(querySnapshot);

        // If none found (e.g. we hit a gap at the end), wrap around to the beginning
        if (!validQuote) {
             querySnapshot = await db.collection('quotes')
                .orderBy('index')
                .limit(20)
                .get()
             validQuote = findValidQuote(querySnapshot);
        }

        if (validQuote) {
            console.log(validQuote)
            return res.status(200).json(validQuote)
        } else {
            return res.status(404).json({message: "No approved quotes found."})
        }

    } catch(err){
        console.log('Error: ', err)
        res.status(500).json({ message: 'Failed to retrieve quote' })        
    }
})

app.post('/unsubscribe', async (req, res) => {
    try {
        const rawEmail = req.body?.email || ''
        const email = trimInput(rawEmail).toLowerCase()

        if (!email) {
            return res.status(400).json({ message: 'Email required' })
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' })
        }

        const userDoc = await db.collection('users').doc(email).get()
        if (!userDoc.exists) {
            return res.status(404).json({ message: 'Email not found' })
        }

        await db.collection('users').doc(email).update({
            active: false,
            unsubscribedAt: FieldValue.serverTimestamp()
        })

        res.status(200).json({
            message: 'Successfully unsubscribed',
            email: email
        })

    } catch (err) {
        console.log('Error: ', err)
        res.status(500).json({ message: 'Failed to unsubscribe' })
    }
})

app.post('/send-digest', async (req, res) => {
    try {
        // Manual trigger for digest email (for testing)
        const usersSnapshot = await db.collection('users')
            .where('active', '==', true)
            .get()
        
        const recipients = []
        usersSnapshot.forEach(doc => {
            recipients.push(doc.data().email)
        })

        if (recipients.length === 0) {
            return res.status(400).json({ message: 'No active subscribers found' })
        }

        const data = {
            template: 'digest',
            recipients: recipients,
            subject: 'Your Weekly Quote Digest',
            context: {
                weekNumber: Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 604800000)
            }
        }
        
        await emailQueue.add(data)
        
        res.status(200).json({
            message: 'Digest email queued successfully',
            recipientCount: recipients.length
        })

    } catch (err) {
        console.log('Error: ', err)
        res.status(500).json({ message: 'Failed to queue digest email' })
    }
})


// Newsletter Functions
const transporter = nodemailer.createTransport({
    service: 'smtp.gmail.com',
    port: 456,
    secure: true,
    auth: {
        type: "OAuth2",
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        user: EMAIL_USER,
        pass: EMAIL_PASS 
    }
})

const handlebarsOptions = {
    viewEngine: {
        extName: '.html',
        partialsDir: path.resolve('./emails'),
        defaultLayout: false,
    },
    viewPath: path.resolve('./emails'),
    extName: '.html',
}
transporter.use('compile', hbs(handlebarsOptions))

let emailQueue
if (REDIS_ENABLED) {
    const { REDIS_HOST, REDIS_PORT, REDIS_API_SECRET_KEY, REDIS_API_ACCOUNT_KEY } = process.env

    const redisOptions = {
        host: REDIS_HOST || '127.0.0.1',
        port: parseInt(REDIS_PORT) || 6379,
    }

    // If using a cloud Redis provider requiring password/auth
    if (REDIS_API_SECRET_KEY) {
        redisOptions.password = REDIS_API_SECRET_KEY
    }
    // Some providers might use username/password
    if (REDIS_API_ACCOUNT_KEY && REDIS_API_ACCOUNT_KEY !== 'default') {
        redisOptions.username = REDIS_API_ACCOUNT_KEY
        console.log('🔒 Using Redis Authentication with user:', REDIS_API_ACCOUNT_KEY)
    } else if (REDIS_API_SECRET_KEY) {
        console.log('🔒 Using Redis Authentication with password only')
    }

    console.log(`🔌 Connecting to Redis at ${redisOptions.host}:${redisOptions.port}...`)

    emailQueue = new Queue('email queue', {
        redis: redisOptions
    })
    
    // Email queue event handlers
    emailQueue.on('completed', (job, result) => {
        console.log(`Job ${job.id} completed successfully`)
    })

    emailQueue.on('failed', (job, err) => {
        console.error(`Job ${job.id} failed:`, err.message)
    })

    emailQueue.on('error', (err) => {
        if (err.code === 'ECONNREFUSED') {
            console.error(`❌ Redis Connection Failed: Ensure Redis is running at ${REDIS_HOST}:${REDIS_PORT}`)
        } else {
            console.error('Queue error:', err.message)
        }
    })
} else {
    // Mock Queue for development without Redis
    console.log('⚠️  Redis disabled. Using mock email queue.')
    emailQueue = {
        add: async (data) => {
            console.log('[Mock Queue] Job added:', data.subject || 'No subject')
            // Simulate processing
            setTimeout(() => {
                console.log('[Mock Queue] Job processed (simulated)')
            }, 1000)
            return Promise.resolve({ id: 'mock-job-' + Date.now() })
        },
        process: (concurrency, handler) => {
            console.log(`[Mock Queue] Worker registered with concurrency ${concurrency}`)
            // In a real mock, we might immediately trigger the handler for testing,
            // but for now, just logging is enough to prevent crashes.
        },
        on: () => {}
    }
}

// Schedule weekly digest (every Monday at 9:00 AM)
cron.schedule('0 9 * * 1', async () => {
    try {
        console.log('Running weekly digest scheduler...')
        // Fetch all active subscribers
        const usersSnapshot = await db.collection('users').where('active', '==', true).get()
        
        const recipients = []
        usersSnapshot.forEach(doc => {
            recipients.push(doc.data().email)
        })

        if (recipients.length > 0) {
            const data = {
                template: 'digest',
                recipients: recipients,
                subject: 'Your Weekly Quote Digest',
                context: {
                    weekNumber: Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 604800000)
                }
            }
            await emailQueue.add(data)
            console.log(`Digest email queued for ${recipients.length} recipients`)
        } else {
            console.log('No active subscribers found')
        }
    } catch (err) {
        console.error('Error scheduling digest email:', err)
    }
})

emailQueue.process(1, async (job) => {
    const {template, recipients, subject, context} = job.data;
    
    try {
        // Fetch approved quotes for the digest
        const quotesSnapshot = await db.collection('quotes')
            .where('approved', '==', true)
            .limit(3)
            .get()
        
        const quotes = []
        quotesSnapshot.forEach(doc => {
            quotes.push({
                id: doc.id,
                ...doc.data()
            })
        })

        // Prepare email options
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: recipients.join(', '),
            subject: subject || 'Weekly Digest',
            template: template,
            context: {
                quotes: quotes,
                year: new Date().getFullYear(),
                ...context
            }
        }

        // Send email
        const info = await transporter.sendMail(mailOptions)
        console.log('Email sent successfully:', info.messageId)
        return info
    } catch (err) {
        console.error('Error sending email:', err)
        throw err
    }
})

app.listen(PORT, () => console.log(`Server has started on port: ${PORT}`))
