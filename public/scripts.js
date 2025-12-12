const input = document.getElementById('userEmail')
const signup_btn = document.getElementById('signup_btn')
const errMsg = document.querySelector('.errMsg')
const subMsg = document.querySelector('.subMsg')

// Initially, hide all messages
errMsg.style.display = "none"
subMsg.style.display = "none"

// Email verification criteria, e.g., j.doe@example.com
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function signupNewUser(){
    const user_email = input.value.trim()
    
    // Initially, hide all messages
    errMsg.style.display = "none"
    subMsg.style.display = "none"

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
        input.value = ''

    } catch(err){
        console.log('Signup error: ', err)
        errMsg.style.display = 'inline'
    } finally {
        // Restore button
        //signup_btn.style.pointerEvents = 'auto'
        signup_btn.style.opacity = "1.0"
    }
}

// Tied in to button
signup_btn.addEventListener('click', signupNewUser)

// Allow Enter key to submit
input.addEventListener('keypress', (e) => {
    if (e.key == "Enter"){
        signupNewUser()
    }
})
