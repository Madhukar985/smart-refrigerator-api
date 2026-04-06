// Dashboard Logic
let allItems = [];
let myChart1 = null;
let dynamicCharts = [];

// Camera stream variable
let stream = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Set User Name
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.name) {
        document.getElementById('userNameDisplay').textContent = user.name;
        document.getElementById('userInitial').textContent = user.name.charAt(0).toUpperCase();
        
        // Populate Edit Profile modal
        document.getElementById('editName').value = user.name;
        document.getElementById('editEmail').value = user.email;
    }

    // Event Listeners
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
    document.getElementById('addItemForm').addEventListener('submit', addManualItem);
    document.getElementById('saveProfileBtn').addEventListener('click', updateProfile);
    document.getElementById('saveItemBtn').addEventListener('click', saveEditedItem);
    document.getElementById('testEmailBtn').addEventListener('click', testExpiryEmail);

    // Camera Event Listeners
    document.getElementById('startCameraBtn').addEventListener('click', startCamera);
    document.getElementById('captureImageBtn').addEventListener('click', captureImage);

    // Load Data
    await loadInventory();
    loadExpiringWidget();
});

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

async function testExpiryEmail(e) {
    e.preventDefault();
    showAlert('Sending test email logic... Please wait.', 'info', 'mainContentArea');
    try {
        const res = await fetch('/api/auth/test-email', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        
        if (res.ok) {
            showAlert('Success: ' + data.message, 'success', 'mainContentArea');
        } else {
            showAlert('Error: ' + (data.error || 'Failed to send email'), 'danger', 'mainContentArea');
        }
    } catch (err) {
        console.error(err);
        showAlert('Network error triggering email', 'danger', 'mainContentArea');
    }
}

function showSection(sectionId, clickedElement) {
    // Hide all sections
    document.querySelectorAll('.d-section').forEach(sec => {
        sec.classList.remove('active');
        sec.classList.add('d-none');
    });

    // Remove active class from all links
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active');
    });

    // Show target section and set link active
    document.getElementById(`section-${sectionId}`).classList.remove('d-none');
    document.getElementById(`section-${sectionId}`).classList.add('active');
    
    if (clickedElement) clickedElement.classList.add('active');

    // If analytics section, load charts
    if (sectionId === 'analytics') {
        loadCharts();
    }
    
    // Stop camera if navigating away
    if (sectionId !== 'add-item') {
        stopCamera();
    }

    // Mobile: close sidebar if clicked
    if (window.innerWidth < 768) {
        document.getElementById('sidebar').classList.remove('active');
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

// API Calls
async function loadInventory() {
    try {
        const res = await fetch('/api/food', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (res.status === 401) {
            logout();
            return;
        }

        allItems = await res.json();
        updateDashboardView();
        updateInventoryView();
    } catch (err) {
        console.error('Failed to load inventory', err);
    }
}

function updateDashboardView() {
    // Calculate stats
    const total = allItems.length;
    let fresh = 0;
    let expiring = 0;
    let expired = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dashboardTbody = document.querySelector('#dashboardTable tbody');
    dashboardTbody.innerHTML = '';

    allItems.forEach(item => {
        const expiryDate = new Date(item.expiry_date);
        expiryDate.setHours(0,0,0,0);
        const diffDays = Math.round((expiryDate - today) / (1000 * 60 * 60 * 24));
        let statusClass = 'badge-fresh';
        let statusText = 'Fresh';

        if (diffDays < 0) {
            expired++;
            statusClass = 'badge-expired';
            statusText = 'Expired';
            item.status = 'Expired'; // Auto update local state
        } else if (diffDays <= 2) {
            expiring++;
            statusClass = 'badge-expiring';
            statusText = 'Expiring Soon';
            item.status = 'Expiring Soon';
        } else {
            fresh++;
            item.status = 'Fresh';
        }

        // Add to dashboard quick view if expiring soon (up to 5 items)
        if (item.status === 'Expiring Soon' && dashboardTbody.children.length < 5) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-semibold">${item.item_name}</td>
                <td><span class="text-muted small">${item.category}</span></td>
                <td>${expiryDate.toLocaleDateString()}</td>
                <td><span class="badge ${statusClass} rounded-pill">${statusText}</span></td>
            `;
            dashboardTbody.appendChild(tr);
        }
    });

    if (dashboardTbody.children.length === 0) {
        dashboardTbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No items expiring soon.</td></tr>';
    }

    document.getElementById('totalItemsCount').textContent = total;
    document.getElementById('freshItemsCount').textContent = fresh;
    document.getElementById('expiringItemsCount').textContent = expiring;
    document.getElementById('expiredItemsCount').textContent = expired;
}

function filterAndNavigate(status) {
    const filterEl = document.getElementById('inventoryFilter');
    if (filterEl) filterEl.value = status;
    updateInventoryView();
    showSection('inventory', document.querySelectorAll('.sidebar-link')[1]);
}

function updateInventoryView() {
    const filter = document.getElementById('inventoryFilter') ? document.getElementById('inventoryFilter').value : 'All';
    const tbody = document.querySelector('#inventoryTable tbody');
    tbody.innerHTML = '';

    let itemsToDisplay = allItems;
    if (filter !== 'All') {
        itemsToDisplay = allItems.filter(item => item.status === filter);
    }

    if (itemsToDisplay.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No items to display.</td></tr>';
        return;
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    itemsToDisplay.forEach(item => {
        const expiryDate = new Date(item.expiry_date);
        expiryDate.setHours(0,0,0,0);
        const diffDays = Math.round((expiryDate - today) / (1000 * 60 * 60 * 24));
        let statusClass = 'badge-fresh';
        if (diffDays < 0) statusClass = 'badge-expired';
        else if (diffDays <= 2) statusClass = 'badge-expiring';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="fw-semibold">${item.item_name}</td>
            <td>${item.category}</td>
            <td>${item.quantity} ${item.unit || 'pcs'}</td>
            <td>${expiryDate.toLocaleDateString()}</td>
            <td><span class="badge ${statusClass} rounded-pill">${item.status}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal(${item.item_id})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteItem(${item.item_id})"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Add Item
async function addManualItem(e) {
    e.preventDefault();
    
    const itemData = {
        item_name: document.getElementById('itemName').value,
        category: document.getElementById('itemCategory').value,
        quantity: document.getElementById('itemQuantity').value,
        unit: document.getElementById('itemUnit').value,
        expiry_date: document.getElementById('itemExpiry').value
    };

    try {
        const res = await fetch('/api/food', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(itemData)
        });

        if (res.ok) {
            showAlert('Item Added Successfully', 'success', 'mainContentArea');
            document.getElementById('addItemForm').reset();
            await loadInventory();
            // Automatically switch to inventory view to see it
            setTimeout(() => {
                showSection('inventory', document.querySelectorAll('.sidebar-link')[1]);
            }, 1000);
        } else {
            showAlert('Failed to add item', 'danger', 'mainContentArea');
        }
    } catch (err) {
        console.error(err);
        showAlert('Server error', 'danger', 'mainContentArea');
    }
}

// Delete Item
async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
        const res = await fetch(`/api/food/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (res.ok) {
            showAlert('Item Deleted Successfully', 'success', 'mainContentArea');
            await loadInventory();
        }
    } catch (err) {
        console.error(err);
    }
}

// Edit Item
function openEditModal(id) {
    const item = allItems.find(i => i.item_id === id);
    if (!item) return;

    document.getElementById('editItemId').value = item.item_id;
    document.getElementById('editItemName').value = item.item_name;
    document.getElementById('editItemCategory').value = item.category;
    document.getElementById('editItemQuantity').value = item.quantity;
    document.getElementById('editItemUnit').value = item.unit || 'pcs';
    
    // Format date for input[type="date"]
    const date = new Date(item.expiry_date);
    const formattedDate = date.toISOString().split('T')[0];
    document.getElementById('editItemExpiry').value = formattedDate;
    
    document.getElementById('editItemStatus').value = item.status;

    const modal = new bootstrap.Modal(document.getElementById('editItemModal'));
    modal.show();
}

async function saveEditedItem() {
    const id = document.getElementById('editItemId').value;
    const itemData = {
        item_name: document.getElementById('editItemName').value,
        category: document.getElementById('editItemCategory').value,
        quantity: document.getElementById('editItemQuantity').value,
        unit: document.getElementById('editItemUnit').value,
        expiry_date: document.getElementById('editItemExpiry').value,
        status: document.getElementById('editItemStatus').value
    };

    try {
        const res = await fetch(`/api/food/${id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(itemData)
        });

        if (res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('editItemModal')).hide();
            showAlert('Item Updated Successfully', 'success', 'mainContentArea');
            await loadInventory();
        }
    } catch (err) {
        console.error(err);
    }
}

// Profile update
async function updateProfile() {
    const name = document.getElementById('editName').value;
    const email = document.getElementById('editEmail').value;
    const password = document.getElementById('editPassword').value;

    const payload = {};
    if (name) payload.name = name;
    if (email) payload.email = email;
    if (password) payload.password = password;

    const alertBox = document.getElementById('profileAlert');

    try {
        const res = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            alertBox.innerHTML = '<div class="alert alert-success">Profile updated successfully!</div>';
            
            // Update local storage user info
            const user = JSON.parse(localStorage.getItem('user'));
            if (name) user.name = name;
            if (email) user.email = email;
            localStorage.setItem('user', JSON.stringify(user));
            
            // Update UI
            document.getElementById('userNameDisplay').textContent = user.name;
            document.getElementById('userInitial').textContent = user.name.charAt(0).toUpperCase();

            setTimeout(() => {
                bootstrap.Modal.getInstance(document.getElementById('editProfileModal')).hide();
                alertBox.innerHTML = '';
            }, 1000);
        } else {
            alertBox.innerHTML = `<div class="alert alert-danger">${data.msg}</div>`;
        }
    } catch (err) {
        alertBox.innerHTML = '<div class="alert alert-danger">Server error</div>';
    }
}

// Camera API Handlers
async function startCamera() {
    const video = document.getElementById('camera-preview');
    const startBtn = document.getElementById('startCameraBtn');
    const captureBtn = document.getElementById('captureImageBtn');
    const placeholder = document.getElementById('camera-placeholder');

    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        video.classList.remove('d-none');
        placeholder.classList.add('d-none');
        placeholder.classList.remove('d-flex');
        
        startBtn.classList.add('d-none');
        captureBtn.classList.remove('d-none');
    } catch (err) {
        console.error("Error accessing camera: ", err);
        alert('Could not access camera. Please allow permissions.');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    const video = document.getElementById('camera-preview');
    const startBtn = document.getElementById('startCameraBtn');
    const captureBtn = document.getElementById('captureImageBtn');
    const placeholder = document.getElementById('camera-placeholder');

    video.classList.add('d-none');
    placeholder.classList.remove('d-none');
    placeholder.classList.add('d-flex');
    startBtn.classList.remove('d-none');
    captureBtn.classList.add('d-none');
}

let currentCapturedItem = null;

async function captureImage() {
    const captureBtn = document.getElementById('captureImageBtn');
    
    // Show loading state
    captureBtn.disabled = true;
    captureBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Running Advanced AI...';

    const video = document.getElementById('camera-preview');
    
    // Create a hidden canvas to grab the frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to base64 jpeg
    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    stopCamera();

    try {
        const res = await fetch('/api/food/analyze-image', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ image: base64Image })
        });
        
        const data = await res.json();
        
        if (res.ok && data.name) {
            currentCapturedItem = {
                name: data.name,
                category: data.category,
                qty: data.quantity,
                unit: data.unit || 'pcs',
                expiryDays: data.expiryDays
            };
            
            const resultDiv = document.getElementById('cameraResult');
            resultDiv.innerHTML = `
                <div class="alert alert-success py-2 small mb-0">
                    <strong>AI Detected:</strong> "${currentCapturedItem.name}" <br>
                    Category: ${currentCapturedItem.category} | Qty: ${currentCapturedItem.qty} ${currentCapturedItem.unit} | Est. Expiry: ${currentCapturedItem.expiryDays} days<br>
                    <button class="btn btn-sm btn-link p-0 mt-1" onclick="useCapturedData()">Use this data</button>
                </div>
            `;
            resultDiv.classList.remove('d-none');
        } else {
            console.error(data);
            showAlert(data.error || 'AI Failed to identify standard food item.', 'danger', 'mainContentArea');
        }

    } catch (err) {
        console.error("Advanced AI Error: ", err);
        showAlert('AI Network processing failed.', 'danger', 'mainContentArea');
    } finally {
        captureBtn.disabled = false;
        captureBtn.innerHTML = '<i class="fa-solid fa-camera me-1"></i> Capture & Process';
    }
}

function useCapturedData() {
    if (!currentCapturedItem) return;
    
    // Fill the manual entry form with simulated extracted data
    document.getElementById('itemName').value = currentCapturedItem.name;
    document.getElementById('itemCategory').value = currentCapturedItem.category;
    document.getElementById('itemQuantity').value = currentCapturedItem.qty;
    
    // Check if unit exists in our dropdown
    const unitSelect = document.getElementById('itemUnit');
    const unitExists = Array.from(unitSelect.options).some(opt => opt.value === currentCapturedItem.unit);
    if (unitExists) unitSelect.value = currentCapturedItem.unit;
    else unitSelect.value = 'pcs';
    
    // Set expiry
    const d = new Date();
    d.setDate(d.getDate() + currentCapturedItem.expiryDays);
    document.getElementById('itemExpiry').value = d.toISOString().split('T')[0];
    
    document.getElementById('cameraResult').classList.add('d-none');
    
    showAlert('Data extracted from image and filled in the form', 'info', 'mainContentArea');
}

// Charts
function loadCharts() {
    if (myChart1) myChart1.destroy();
    dynamicCharts.forEach(c => c.destroy());
    dynamicCharts = [];

    // Prepare data
    const itemQty = {};
    const categoryItems = {};

    allItems.forEach(item => {
        const name = item.item_name.toLowerCase().trim();
        const display = name.charAt(0).toUpperCase() + name.slice(1);
        
        // Calculate usage by entry count (ignoring physical quantity for pie sections so ml/grams dont completely dwarf PCs visually in the pie)
        itemQty[display] = (itemQty[display] || 0) + 1;
        
        // Group items strictly inside their respective categories
        if (!categoryItems[item.category]) categoryItems[item.category] = {};
        categoryItems[item.category][display] = (categoryItems[item.category][display] || 0) + item.quantity;
    });

    const ctx1 = document.getElementById('categoryChart').getContext('2d');

    // Dynamically generate a large palette for potentially many items
    const dynamicPalette = [];
    for(let i=0; i<Object.keys(itemQty).length; i++) {
        const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6B7280', '#06b6d4', '#f97316', '#84cc16', '#eab308'];
        dynamicPalette.push(colors[i % colors.length]);
    }

    myChart1 = new Chart(ctx1, {
        type: 'pie',
        data: {
            labels: Object.keys(itemQty),
            datasets: [{
                data: Object.values(itemQty),
                backgroundColor: dynamicPalette,
                borderWidth: 2,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            }
        }
    });

    // Generate dynamic charts for each category
    const container = document.getElementById('dynamicCategoryChartsContainer');
    container.innerHTML = '';

    Object.keys(categoryItems).forEach((catName, index) => {
        const itemData = categoryItems[catName];
        
        // build column
        const col = document.createElement('div');
        col.className = 'col-md-6 mb-4';
        
        const canvasId = `catChart_${index}`;
        col.innerHTML = `
            <div class="table-card h-100">
                <h5 class="fw-bold mb-4 fs-6 pb-2 border-bottom">${catName} Items</h5>
                <div class="px-3 pb-2" style="position: relative; height:250px; width:100%">
                    <canvas id="${canvasId}"></canvas>
                </div>
            </div>
        `;
        container.appendChild(col);

        // draw chart
        const ctx = document.getElementById(canvasId).getContext('2d');
        
        // Sort items in this category by quantity
        const sorted = Object.entries(itemData).sort((a,b) => b[1] - a[1]);
        const labels = sorted.map(i => i[0]);
        const data = sorted.map(i => i[1]);

        // Dynamically rotate vibrant colors for bars
        const colorPalette = ['#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#4F46E5'];
        const barColor = colorPalette[index % colorPalette.length];

        const newChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Quantity',
                    data: data,
                    backgroundColor: barColor,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
        dynamicCharts.push(newChart);
    });
}

// Utilities
function showAlert(message, type, containerId) {
    const alertPlaceholder = document.getElementById('alertPlaceholder');
    alertPlaceholder.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>`;

    setTimeout(() => {
        alertPlaceholder.innerHTML = '';
    }, 4000);
}

async function loadExpiringWidget() {
    try {
        const res = await fetch('/api/food/expiring', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!res.ok) return;
        
        const data = await res.json();
        const badge = document.getElementById('notificationBadge');
        
        if (data.expiringItems && data.expiringItems.length > 0) {
            badge.classList.remove('d-none');
            badge.textContent = data.expiringItems.length;
            document.getElementById('expiringCount').textContent = data.expiringItems.length;
            
            const listContainer = document.getElementById('expiringItemsList');
            listContainer.innerHTML = '';
            
            data.expiringItems.forEach(item => {
                let daysText;
                if (item.days_to_expire === 0) {
                    daysText = 'today';
                } else if (item.days_to_expire === 1) {
                    daysText = '1 day';
                } else {
                    daysText = item.days_to_expire + ' days';
                }
                const badgeClass = item.days_to_expire === 0 ? 'bg-danger' : (item.days_to_expire === 1 ? 'bg-danger' : 'bg-warning text-dark');
                
                listContainer.innerHTML += `
                    <li class="list-group-item d-flex justify-content-between align-items-center bg-transparent px-0 border-bottom">
                        <div>
                            <span class="fw-bold">${item.item_name}</span>
                            <span class="text-muted ms-2">(Qty: ${item.quantity} ${item.unit || 'pcs'})</span>
                        </div>
                        <span class="badge ${badgeClass} rounded-pill">Expires in ${daysText}</span>
                    </li>
                `;
            });
            
            if (data.aiSuggestion) {
                let formattedSuggestion = data.aiSuggestion;
                // Only parse basic Markdown if it doesn't already look like HTML
                if (!formattedSuggestion.includes('<br>')) {
                    formattedSuggestion = formattedSuggestion.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    // Replace bullet prefixes "* " or "- " with HTML bullets
                    formattedSuggestion = formattedSuggestion.replace(/(?:^|\n)[\*\-]\s+/g, '\n&bull; ');
                    // Replace newlines with <br>
                    formattedSuggestion = formattedSuggestion.replace(/\n/g, '<br>');
                }
                document.getElementById('aiMealSuggestionText').innerHTML = formattedSuggestion;
            } else {
                document.getElementById('aiMealSuggestionText').innerHTML = "No AI suggestion could be generated at this time. Try to use these items soon!";
            }
            
        } else {
            badge.classList.add('d-none');
        }
    } catch (err) {
        console.error("Failed to load expiring widget", err);
    }
}
