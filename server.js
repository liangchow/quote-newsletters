const express = require('express')
const { db } = require('./firebase')
const app = express()
const PORT = 1339
require('dotenv').config

app.use(express.json())
app.use(express.static('public'))

app.post('/signup', async (req, res) => {
    const newEmail = (req.body && req.body.email || '').trim()
    if (!newEmail){
        return res.status(400).json({ error: 'Email required' })
    }
    try {
        await db.collection('users').doc(newEmail).set({ email: newEmail }, { merge: true })
        res.json({ success: true })
    } catch (err) {
        res.status(500).json({ error: 'Failed to register' })
    }
})

app.listen(PORT, () => console.log(`Server has started on port: ${PORT}`))
