// ========================================
// StudentMS Dashboard
// Connected to PostgreSQL through backend
// ========================================

const API_URL = "http://localhost:3000/api";

const token = localStorage.getItem("authToken");

if (!token) {
    window.location.replace("login.html");
}

// HTML elements
const userForm = document.getElementById("userForm");
const userTable = document.getElementById("userTable");
const searchInput = document.getElementById("search");

const formTitle = document.getElementById("formTitle");
const saveButton = document.getElementById("saveButton");
const cancelButton = document.getElementById("cancelButton");

const formMessage = document.getElementById("formMessage");
const tableMessage = document.getElementById("tableMessage");

let users = [];
let editingUserId = null;


// ========================================
// API helper
// ========================================

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
        window.location.replace("login.html");

        throw new Error("Session expired. Please log in again.");
    }

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
    }

    return data;
}


// ========================================
// Show logged-in user
// ========================================

function showCurrentUser() {
    const savedUser = localStorage.getItem("user");
    const currentUserElement = document.getElementById("currentUser");

    if (!currentUserElement) return;

    try {
        const user = JSON.parse(savedUser);

        currentUserElement.textContent = user?.name || "User";
    } catch {
        currentUserElement.textContent = "User";
    }
}


// ========================================
// Load users from PostgreSQL
// ========================================

async function loadUsers() {
    userTable.innerHTML = `
        <tr>
            <td colspan="7">Loading records...</td>
        </tr>
    `;

    try {
        const data = await apiRequest("/users");

        users = Array.isArray(data) ? data : [];

        displayUsers();
        updateDashboard();

        tableMessage.textContent = "";

    } catch (error) {
        userTable.innerHTML = `
            <tr>
                <td colspan="7">Could not load records.</td>
            </tr>
        `;

        tableMessage.textContent = error.message;
        tableMessage.style.color = "#f87171";
    }
}


// ========================================
// Display users in the table
// ========================================

function displayUsers(userList = users) {
    userTable.innerHTML = "";

    if (userList.length === 0) {
        userTable.innerHTML = `
            <tr>
                <td colspan="7">No users found.</td>
            </tr>
        `;
        return;
    }

    userList.forEach((user) => {
        const row = document.createElement("tr");

        const values = [
            user.id,
            user.name,
            user.email,
            user.courses || "—",
            `₹${Number(user.fee || 0).toLocaleString("en-IN")}`,
            user.is_active ? "Active" : "Inactive"
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");

            // Use textContent to avoid interpreting database text as HTML.
            cell.textContent = value;

            if (index === 5) {
                cell.className = user.is_active
                    ? "status-active"
                    : "status-inactive";
            }

            row.appendChild(cell);
        });

        const actionsCell = document.createElement("td");

        const editButton = document.createElement("button");
        editButton.textContent = "Edit";
        editButton.className = "edit-btn";
        editButton.addEventListener("click", () => editUser(user.id));

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.className = "delete-btn";
        deleteButton.addEventListener("click", () => deleteUser(user.id));

        actionsCell.append(editButton, deleteButton);
        row.appendChild(actionsCell);

        userTable.appendChild(row);
    });
}


// ========================================
// Update dashboard cards
// ========================================

function updateDashboard() {
    const total = users.length;

    const active = users.filter(
        user => user.is_active === true
    ).length;

    const inactive = total - active;

    const totalFees = users.reduce(
        (sum, user) => sum + Number(user.fee || 0),
        0
    );

    document.getElementById("totalUsers").textContent = total;

    document.getElementById("activeUsers").textContent = active;

    document.getElementById("inactiveUsers").textContent = inactive;

    document.getElementById("totalFees").textContent =
        `₹${totalFees.toLocaleString("en-IN")}`;
}


// ========================================
// Add or update user
// ========================================
userForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    formMessage.textContent = "";

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const courses = document.getElementById("courses").value.trim();
    const feeInput = document.getElementById("fee").value;
    const fee = Number(feeInput);

    const is_active =
        document.getElementById("is_active").value === "true";

    const isAdding = editingUserId === null;

    if (
        !name ||
        !email ||
        !courses ||
        feeInput.trim() === "" ||
        !Number.isFinite(fee) ||
        fee < 0
    ) {
        formMessage.textContent = "Please enter valid details in all required fields.";
        formMessage.style.color = "#f87171";
        return;
    }

    if (isAdding && password.length < 8) {
        formMessage.textContent = "Password must be at least 8 characters.";
        formMessage.style.color = "#f87171";
        return;
    }

    const userData = {
        name,
        email,
        courses,
        fee,
        is_active
    };

    if (isAdding) {
        userData.password = password;
    }

    saveButton.disabled = true;
    saveButton.textContent = isAdding ? "Adding..." : "Updating...";

    try {
        if (isAdding) {
            await apiRequest("/users", {
                method: "POST",
                body: JSON.stringify(userData)
            });

            formMessage.textContent = "Student added successfully!";
        } else {
            await apiRequest(`/users/${editingUserId}`, {
                method: "PUT",
                body: JSON.stringify(userData)
            });

            formMessage.textContent = "Student updated successfully!";
        }

        formMessage.style.color = "#4ade80";

        resetForm();
        await loadUsers();

    } catch (error) {
        formMessage.textContent = error.message || "Something went wrong.";
        formMessage.style.color = "#f87171";
    } finally {
        saveButton.disabled = false;
        saveButton.textContent =
            editingUserId === null ? "Add User" : "Update User";
    }
});

// ========================================
// Edit user
// ========================================

function editUser(id) {
    const user = users.find(item => Number(item.id) === Number(id));

    if (!user) return;

    editingUserId = user.id;

    document.getElementById("name").value = user.name || "";
    document.getElementById("email").value = user.email || "";
    document.getElementById("courses").value = user.courses || "";
    document.getElementById("fee").value = Number(user.fee || 0);
    document.getElementById("is_active").value =
        String(Boolean(user.is_active));

    formTitle.textContent = "Edit User";
    saveButton.textContent = "Update User";
    cancelButton.hidden = false;

    formMessage.textContent = "";

    document.getElementById("userFormSection").scrollIntoView({
        behavior: "smooth"
    });
}


// ========================================
// Reset form
// ========================================

function resetForm() {
    userForm.reset();

    editingUserId = null;

    formTitle.textContent = "Add New User";
    saveButton.textContent = "Add User";
    cancelButton.hidden = true;

    formMessage.textContent = "";
}

cancelButton.addEventListener("click", resetForm);


// ========================================
// Delete user
// ========================================

const deleteDialog = document.getElementById("deleteConfirmDialog");
const deleteConfirmText = document.getElementById("deleteConfirmText");
const cancelDeleteButton = document.getElementById("cancelDeleteButton");
const confirmDeleteButton = document.getElementById("confirmDeleteButton");

let pendingDeleteUser = null;

function deleteUser(id) {
    const user = users.find(
        item => Number(item.id) === Number(id)
    );

    if (!user) return;

    if (Number(user.id) === Number(getLoggedInUserId())) {
        alert("You cannot delete your own account while logged in.");
        return;
    }

    pendingDeleteUser = user;

    deleteConfirmText.textContent =
        `Are you sure you want to delete ${user.name}? This action cannot be undone.`;

    confirmDeleteButton.disabled = false;
    confirmDeleteButton.textContent = "Delete Student";

    deleteDialog.showModal();
}

cancelDeleteButton.addEventListener("click", () => {
    pendingDeleteUser = null;
    deleteDialog.close();
});

confirmDeleteButton.addEventListener("click", async () => {
    if (!pendingDeleteUser) return;

    const userToDelete = pendingDeleteUser;

    confirmDeleteButton.disabled = true;
    confirmDeleteButton.textContent = "Deleting...";

    try {
        await apiRequest(`/users/${userToDelete.id}`, {
            method: "DELETE"
        });

        deleteDialog.close();

        tableMessage.textContent = "Student deleted successfully!";
        tableMessage.style.color = "#4ade80";

        await loadUsers();

    } catch (error) {
        deleteDialog.close();

        tableMessage.textContent =
            error.message || "Could not delete student.";
        tableMessage.style.color = "#f87171";

    } finally {
        pendingDeleteUser = null;
        confirmDeleteButton.disabled = false;
        confirmDeleteButton.textContent = "Delete Student";
    }
});



// ========================================
// Logged-in user ID
// ========================================

function getLoggedInUserId() {
    try {
        const user = JSON.parse(localStorage.getItem("user"));
        return user?.id;
    } catch {
        return null;
    }
}


// ========================================
// Search users
// ========================================

searchInput.addEventListener("input", () => {
    const searchText = searchInput.value.trim().toLowerCase();

    const filteredUsers = users.filter(user =>
        String(user.id).includes(searchText) ||
        (user.name || "").toLowerCase().includes(searchText) ||
        (user.email || "").toLowerCase().includes(searchText) ||
        (user.courses || "").toLowerCase().includes(searchText)
    );

    displayUsers(filteredUsers);
});


// ========================================
// Logout
// ========================================

document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");

    window.location.replace("login.html");
});


// ========================================
// Start dashboard
// ========================================

showCurrentUser();
loadUsers();