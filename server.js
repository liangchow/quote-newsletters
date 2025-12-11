const express = require('express')
const { db } = require('./firebase')
const app = express()
const PORT = 1339
require('dotenv').config

// Middleware
app.use(express.json())
app.use(express.static('public'))

// Routes
app.post('/signup', async (req, res) => {
    // Safety clause
    const newEmail = (req.body && req.body.email || '').trim()

    if (!newEmail){
        return res.status(400).send({ message: 'Email required' })
    }

    // Email verification, e.g., j.doe@example.com
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)){
            return res.status(400).send({ message: 'Invalid email format' })
        }

    try {
        await db.collection('users').doc(newEmail).set({ 
            email: newEmail,
            subscribedAt: new Date().toDateString, 
         }, { merge: true })

         // Send success response
         res.status(200).json({
            message: "Sucessfully subscribed",
            email: newEmail,
         })

    } catch (err) {
        console.log('Error: ', err)
        res.status(500).send({ message: 'Failed to register' })
    }
})

app.listen(PORT, () => console.log(`Server has started on port: ${PORT}`))
