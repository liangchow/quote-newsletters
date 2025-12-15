const express = require('express')
const { db } = require('./firebase')
const { collection, addDoc } = require('firebase/firestore')
const app = express()
const PORT = process.env.PORT || 1339
require('dotenv').config()

// Middleware
app.use(express.json({limit: '10kb'})) // Limit payload size for security
app.use(express.static('public'))

// Utility functions
function trimInput(input){
    if (typeof input !== 'string') return ''
    return input.trim().replace(/[<>]/g, '')
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

        // Check if email already exists
        const userDoc = await db.collection('users').doc(newEmail).get()
        if (userDoc.exists){
            return res.status(200).json({message: "You're already subscribed"})
        }

        await db.collection('users').doc(newEmail).set({ 
            email: newEmail,
            subscribedAt: new Date().toISOString(),
            active: true, 
         }, { merge: true })

         // Send success response
         res.status(200).json({
            message: "Sucessfully subscribed",
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

        const docRef = await addDoc(collection(db,'quotes'),{     
            text: newText,
            author: newAuthor,
            area: newArea,
            submittedAt: new Date().toISOString(),
            approved: false 
         }, { merge: true })

         // Send success response
         res.status(200).json({
            message: "Sucessfully submitted",
            text: newText,
            author: newAuthor,
            area: newArea,
         })

    } catch (err) {
        console.log('Error: ', err)
        res.status(500).json({ message: 'Failed to submit' })
    }
})

app.listen(PORT, () => console.log(`Server has started on port: ${PORT}`))
