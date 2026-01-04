const express = require('express')
require('dotenv').config()
const nodemailer = require('nodemailer')
const path = require('path')
const hbs = require('nodemailer-express-handlebars').default
const cron = require('node-cron')
const { db } = require('./firebase')
const { FieldValue } = require('firebase-admin/firestore')

const app = express()
const PORT = process.env.PORT || 1339
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`
const { EMAIL_USER, EMAIL_PASS } = process.env

// Middleware
app.use(express.json({limit: '10kb'})) // Limit payload size for security
app.use(express.urlencoded({extended: true})) // Support form submissions
app.use(express.static('public'))

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    next()
})

// Utility functions
function trimInput(input){
    if (typeof input !== 'string') return ''
    return input.trim().replace(/[<>]/g, '')
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
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
        if (!isValidEmail(newEmail)){
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
            return res.status(400).json({ message: 'All fields required' })
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

app.get('/unsubscribe', async (req, res) => {
    try {
        const rawEmail = req.query?.email || ''
        const email = trimInput(rawEmail).toLowerCase()

        if (!email) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Error - QuoteByte</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                        h1 { color: #e74c3c; }
                    </style>
                </head>
                <body>
                    <h1>Error</h1>
                    <p>Email address is required</p>
                </body>
                </html>
                `)
        }

        if (!isValidEmail(email)) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Error - QuoteByte</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                        h1 { color: #e74c3c; }
                    </style>
                </head>
                <body>
                    <h1>Error</h1>
                    <p>Invalid email format</p>
                </body>
                </html>
            `)
        }

        const userDoc = await db.collection('users').doc(email).get()
        if (!userDoc.exists) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Not Found - QuoteByte</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                        h1 { color: #e74c3c; }
                    </style>
                </head>
                <body>
                    <h1>Not Found</h1>
                    <p>Email address not found in our system</p>
                </body>
                </html>
            `)
        }

        // Check if already unsubscribed
        const userData = userDoc.data()
        if (userData.active === false) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Already Unsubscribed - QuoteByte</title>
                    <style>
                        body { 
                            font-family: 'Arial', sans-serif; 
                            max-width: 600px; 
                            margin: 50px auto; 
                            padding: 20px; 
                            text-align: center;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 10px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                        }
                        h1 { color: #667eea; margin-bottom: 20px; }
                        p { color: #666; line-height: 1.6; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Already Unsubscribed</h1>
                        <p>You have already been removed from our mailing list.</p>
                        <p>If this was a mistake, you can always subscribe again!</p>
                    </div>
                </body>
                </html>
            `)
        }

        // Update user to inactive, active => false
        await db.collection('users').doc(email).update({
            active: false,
            unsubscribedAt: FieldValue.serverTimestamp()
        })

   console.log(`User unsubscribed: ${email}`)

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Successfully Unsubscribed - QuoteByte</title>
                <style>
                    body { 
                        font-family: 'Arial', sans-serif; 
                        max-width: 600px; 
                        margin: 50px auto; 
                        padding: 20px; 
                        text-align: center;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 10px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                    }
                    h1 { color: #27ae60; margin-bottom: 20px; }
                    p { color: #666; line-height: 1.6; }
                    .email { 
                        background: #f8f9fa; 
                        padding: 10px; 
                        border-radius: 5px; 
                        margin: 20px 0;
                        font-family: monospace;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✓ Successfully Unsubscribed</h1>
                    <p>You have been removed from our weekly quote newsletter.</p>
                    <div class="email">${email}</div>
                    <p>We're sorry to see you go! If you change your mind, you can always subscribe again.</p>
                    <p>Thank you for being part of QuoteByte!</p>
                </div>
            </body>
            </html>
        `)

    } catch (err) {
        console.error('Unsubscribe error:', err)
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error - QuoteByte</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                    h1 { color: #e74c3c; }
                </style>
            </head>
            <body>
                <h1>Error</h1>
                <p>Failed to unsubscribe. Please try again later.</p>
            </body>
            </html>
        `)
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

app.post('/send_digest', async (req, res) => {
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

        // Add each recipient as an individual job to the queue
        let queuedCount = 0;
        for (const recipient of recipients) {
            const data = {
                template: 'digest',
                recipients: [recipient], // Pass as array for compatibility with worker
                subject: 'Your Weekly Quote Digest',
                context: {
                    weekNumber: Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 604800000)
                }
            }
            await emailQueue.add(data)
            queuedCount++;
        }
        
        res.status(200).json({
            message: 'Digest emails queued successfully',
            recipientCount: queuedCount
        })

    } catch (err) {
        console.log('Error: ', err)
        res.status(500).json({ message: 'Failed to queue digest email' })
    }
})


// Newsletter Functions
const transporter = nodemailer.createTransport({
    host: 'mail.hatbyte.com',
    port: 587,
    secure: false,
    auth: {
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

class InMemoryQueue {
    constructor(name) {
        this.name = name
        this.handler = null
        this.listeners = { completed: [], failed: [], error: [] }
    }
    process(concurrency, handler) {
        this.handler = handler
    }
    on(event, cb) {
        if (this.listeners[event]) this.listeners[event].push(cb)
    }
    async add(data) {
        const job = { id: String(Date.now()), data }
        setImmediate(async () => {
            if (!this.handler) return
            try {
                const result = await this.handler({ id: job.id, data: job.data })
                this.listeners.completed.forEach(fn => fn({ id: job.id }, result))
            } catch (err) {
                this.listeners.failed.forEach(fn => fn({ id: job.id }, err))
            }
        })
        return { id: job.id }
    }
}

const emailQueue = new InMemoryQueue('email queue')
emailQueue.on('completed', (job, result) => {
    console.log(`Job ${job.id} completed successfully`)
})
emailQueue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message)
})

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
            console.log(`Queueing digest emails for ${recipients.length} recipients...`)
            for (const recipient of recipients) {
                const data = {
                    template: 'digest',
                    recipients: [recipient], // Pass as array for compatibility
                    subject: 'Weekly QuoteByte',
                    context: {
                        weekNumber: Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 604800000)
                    }
                }
                await emailQueue.add(data)
            }
            console.log(`Digest emails queued for ${recipients.length} recipients`)
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
        // Fetch a single random approved quote via our API
        // Note: fetch needs a full URL in Node.js environment
        const url = `http://127.0.0.1:${PORT}/get_random_quote`;
        console.log(`Fetching quote from: ${url}`);
        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`Failed to fetch random quote: ${res.status} ${res.statusText}`)
        }
        const quote = await res.json()

        // Send email
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: recipients[0], // We now only have one recipient per job
                subject: subject || 'Weekly QuoteByte',
                template: template,
                context: {
                    quotes: quote,
                    year: new Date().getFullYear(),
                    unsubscribeLink: `${BASE_URL}/unsubscribe?email=${encodeURIComponent(recipients[0])}`,
                    ...context
                }
            }

            const info = await transporter.sendMail(mailOptions)
            console.log(`Email sent successfully to ${recipients[0]}:`, info.messageId)
            return info
        } catch (error) {
            console.error(`Failed to send email to ${recipients[0]}:`, error.message)
            throw error
        }
    } catch (err) {
        console.error('Error sending email:', err)
        throw err
    }
})

app.listen(PORT, () => console.log(`Server has started on port: ${PORT}`))
