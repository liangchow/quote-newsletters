const express = require('express')
const { db } = require('./firebase')
const { FieldValue } = require('firebase-admin/firestore')
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

function getRandomInteger(min = 0, max){
    return Math.floor(Math.random() * (max-min)) + min
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

app.post('/get_quote', async (res, req) => {
    try {
        const snapshot = await db.collection('quotes').orderBy('index', 'desc').limit(1).get()

        if (!snapshot.empty) {
            const lastIndex = snapshot.data().index
            // const lastIndex = snapshot.docs[0].data().index
            const targetIndex = getRandomInteger(min, lastIndex)
        }

        const querySnapshot = await db.collection('quotes').where('approved', '==', true).where('index', '=<', targetIndex).limit(1).get()

        if (querySnapshot.exists){
            const quoteData = {id: querySnapshot.id, ...querySnapshot.data()}
            console.log(quoteData)
            return res.status(200).json(quoteData)
        }

    } catch(err){
        console.log('Error: ', err)
        res.status(500).json({ message: 'Failed to retrieve quote' })        
    }
})

app.listen(PORT, () => console.log(`Server has started on port: ${PORT}`))
