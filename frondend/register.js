const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");
const registerButton = document.getElementById("registerButton");

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    registerMessage.textContent = "";
    registerButton.disabled = true;
    registerButton.textContent = "Creating account...";

    const userData = {
        name: document.getElementById("name").value.trim(),
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
        courses: document.getElementById("courses").value.trim(),
        fee: Number(document.getElementById("fee").value)
    };

    try {
        const response = await fetch("https://studentms-1-59un.onrender.com/api/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Registration failed.");
        }

        registerMessage.textContent =
            "Account created successfully! Redirecting to login...";

        registerMessage.style.color = "#4ade80";
        registerForm.reset();

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1500);

    } catch (error) {
        registerMessage.textContent =
            error.message || "Could not connect to the server.";

        registerMessage.style.color = "#f87171";

    } finally {
        registerButton.disabled = false;
        registerButton.textContent = "Create Account";
    }
});