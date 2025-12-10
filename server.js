const express = require('express')
const app = express()
const PORT = 1339
require('dotenv').config

// variables

// middleware
app.use(express.static('public'))

// routes
app.post('/signup', async (req, res) => {

    // Create firebase record
    const data = {
        email: newEmail,
    }

    const db = await db.collection('users').doc(newEmail).set(data, {merge: true})

})

app.listen(PORT, () => console.log(`Server has started on port: ${PORT}`))