const emailInput = document.getElementById('userEmail')
const quoteTextInput = document.getElementById('quoteText')
const quoteAuthorInput = document.getElementById('quoteAuthor')
const quoteAreaInput = document.getElementById('quoteArea')

const signup_btn = document.getElementById('signup_btn')
const share_btn = document.getElementById('share_btn')

const errMsg = document.querySelector('.errMsg')
const subMsg = document.querySelector('.subMsg')
const quoteErrMsg = document.querySelector('.quoteErrMsg')
const quoteSubMsg = document.querySelector('.quoteSubMsg')
const quoteForm = document.querySelector('.quoteSubmission')

// Initially, hide all messages
// errMsg.style.display = "none"
// subMsg.style.display = "none"
// quoteErrMsg.style.display = "none"
// quoteSubMsg.style.display = "none"

// Email verification criteria, e.g., j.doe@example.com
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Utility functions
function trimInput(input){
    return input.trim().replace(/[<>]/g, '')
}

function hideMessages(message){
    message.forEach(msg => msg.style.display = "none")
}



async function signupNewUser(){
    const user_email = trimInput(emailInput.value)
    
    // Initially, hide all subscription messages
    hideMessages([errMsg, subMsg])

    // Email verification
    if (!user_email || !emailRegex.test(user_email)){
        errMsg.style.display = "inline"
        return
    }

    // Disable button on submit
    // signup_btn.style.pointerEvents = "none"
    signup_btn.style.opacity = "0.6" 

    try {
        const res = await fetch('/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user_email })
        })
        if (!res.ok){
            throw new Error('Signup failed')
        }

        // if success
        subMsg.style.display = 'inline'
        emailInput.value = ''

    } catch(err){
        console.log('Signup error: ', err)
        errMsg.style.display = 'inline'
    } finally {
        // Restore button
        //signup_btn.style.pointerEvents = 'auto'
        signup_btn.style.opacity = "1.0"
    }
}

async function submitQuote(){
    const quote_text = trimInput(quoteTextInput.value)
    const quote_author = trimInput(quoteAuthorInput.value)
    const quote_area = trimInput(quoteAreaInput.value)
    
    // Initially, hide all submission messages
    hideMessages([quoteErrMsg, quoteSubMsg])

    // Required field
    if (!quote_text || !quote_author || !quote_area){
        quoteErrMsg.style.display = 'inline'
    }

    // Disable button on submit
    // share_btn.style.pointerEvents = "none"
    share_btn.style.opacity = "0.6" 

    try {
        const res = await fetch('/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: quote_text,
                author: quote_author,
                area : quote_area,
            })
        })
        if (!res.ok){
            throw new Error('Submission failed')
        }

        // if success
        quoteSubMsg.style.display = 'inline'
        quoteForm.reset()

    } catch(err){
        console.log('Submission error: ', err)
        quoteErrMsg.style.display = 'inline'
    } finally {
        // Restore button
        //share_btn.style.pointerEvents = 'auto'
        share_btn.style.opacity = "1.0"
        quoteForm.reset()
    }
}

// Tied in to button
signup_btn.addEventListener('click', signupNewUser)
share_btn.addEventListener('click', submitQuote)

// Allow Enter key to submit
emailInput.addEventListener('keypress', (e) => {
    if (e.key == "Enter"){
        e.preventDefault()
        signupNewUser()
    }
})

quoteForm.addEventListener('keypress', (e) => {
    if (e.key == "Enter" && !e.shiftKey){
        e.preventDefault()
        submitQuote()
    }
})
