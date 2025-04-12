/**
 * EHR Facial Authentication System
 * Face Recognition Authentication Logic
 */

// FaceAuth module for handling facial recognition
const FaceAuth = (function() {
    // Private variables
    let isModelLoaded = false;
    let faceMatcher = null;
    let registeredUsers = [];
    let currentStream = null;
    let loginCheckInterval = null;
    let capturedDescriptor = null;
    
    // DOM Elements
    const elements = {
        loadingSpinner: document.getElementById('loadingSpinner'),
        registerVideo: document.getElementById('registerVideo'),
        registerCanvas: document.getElementById('registerCanvas'),
        loginVideo: document.getElementById('loginVideo'),
        loginCanvas: document.getElementById('loginCanvas'),
        captureBtn: document.getElementById('captureBtn'),
        saveBtn: document.getElementById('saveBtn'),
        authStatus: document.getElementById('authStatus'),
        userInfo: document.getElementById('userInfo')
    };
    
    // Load face-api models
    async function loadModels() {
        try {
            elements.loadingSpinner.classList.remove('hidden');
            
            // Load detection models
            await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
            await faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models');
            await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
            
            isModelLoaded = true;
            console.log('Face recognition models loaded successfully');
            
            // Load registered users from storage
            loadRegisteredUsers();
            
            elements.captureBtn.disabled = false;
            return true;
        } catch (error) {
            console.error('Error loading face recognition models:', error);
            App.showNotification('Failed to load facial recognition models. Please refresh and try again.', 'danger');
            return false;
        } finally {
            elements.loadingSpinner.classList.add('hidden');
        }
    }
    
    // Load registered users from local storage
    function loadRegisteredUsers() {
        const storedUsers = localStorage.getItem('ehrFaceUsers');
        if (storedUsers) {
            registeredUsers = JSON.parse(storedUsers);
            createFaceMatcher();
        }
    }
    
    // Create face matcher from registered users
    function createFaceMatcher() {
        if (registeredUsers.length > 0) {
            const labeledDescriptors = registeredUsers.map(user => {
                return new faceapi.LabeledFaceDescriptors(
                    user.username,
                    [new Float32Array(user.faceDescriptor)]
                );
            });
            faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
        }
    }
    
    // Start video stream
    async function startVideo(videoElement) {
        if (currentStream) {
            stopVideoStream();
        }
        
        try {
            currentStream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: 640, 
                    height: 480,
                    facingMode: 'user'
                }
            });
            videoElement.srcObject = currentStream;
            
            return new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    resolve(true);
                };
            });
        } catch (error) {
            console.error('Error starting camera:', error);
            App.showNotification('Failed to access camera. Please check permissions and try again.', 'danger');
            return Promise.reject(error);
        }
    }
    
    // Stop video stream
    function stopVideoStream() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        
        if (loginCheckInterval) {
            clearInterval(loginCheckInterval);
            loginCheckInterval = null;
        }
    }
    
    // Initialize the registration process
    async function initRegistration() {
        if (!isModelLoaded) {
            App.showNotification('Face recognition system is not ready. Please wait...', 'warning');
            return;
        }
        
        elements.saveBtn.classList.add('hidden');
        await startVideo(elements.registerVideo);
        
        // Clear previous captured face
        capturedDescriptor = null;
        clearCanvas(elements.registerCanvas);
    }
    
    // Initialize the login process
    async function initLogin() {
        if (!isModelLoaded) {
            App.showNotification('Face recognition system is not ready. Please wait...', 'warning');
            return;
        }
        
        if (!faceMatcher || registeredUsers.length === 0) {
            elements.authStatus.innerHTML = '<div class="alert auth-failed">No registered users. Please register first.</div>';
            return;
        }
        
        elements.authStatus.innerHTML = '<div class="alert auth-attempting">Scanning for face...</div>';
        
        await startVideo(elements.loginVideo);
        startFaceAuthentication();
    }
    
    // Capture face for registration
    async function captureFace() {
        if (!isModelLoaded) {
            App.showNotification('Face recognition system is not ready. Please wait...', 'warning');
            return;
        }
        
        try {
            elements.loadingSpinner.classList.remove('hidden');
            elements.captureBtn.disabled = true;
            
            const detections = await faceapi.detectSingleFace(
                elements.registerVideo, 
                new faceapi.TinyFaceDetectorOptions()
            ).withFaceLandmarks(true).withFaceDescriptor();
            
            if (!detections) {
                App.showNotification('No face detected. Please position yourself properly in front of the camera.', 'warning');
                elements.captureBtn.disabled = false;
                elements.loadingSpinner.classList.add('hidden');
                return;
            }
            
            // Draw detection on canvas
            const displaySize = { 
                width: elements.registerVideo.width || 640, 
                height: elements.registerVideo.height || 480 
            };
            faceapi.matchDimensions(elements.registerCanvas, displaySize);
            
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            clearCanvas(elements.registerCanvas);
            
            faceapi.draw.drawDetections(elements.registerCanvas, resizedDetections);
            faceapi.draw.drawFaceLandmarks(elements.registerCanvas, resizedDetections);
            
            // Store descriptor
            capturedDescriptor = Array.from(detections.descriptor);
            
            // Enable save button
            elements.saveBtn.classList.remove('hidden');
            
            App.showNotification('Face captured successfully. Please fill your details and save.', 'success');
            
        } catch (error) {
            console.error('Error capturing face:', error);
            App.showNotification('Error capturing face. Please try again.', 'danger');
        } finally {
            elements.loadingSpinner.classList.add('hidden');
            elements.captureBtn.disabled = false;
        }
    }
    
    // Save registered user
    function saveRegisteredUser() {
        const username = document.getElementById('username').value;
        const employeeId = document.getElementById('employeeId').value;
        const accessLevel = document.getElementById('accessLevel').value;
        
        if (!App.validateForm('registrationForm')) {
            App.showNotification('Please fill out all fields correctly', 'warning');
            return;
        }
        
        if (!capturedDescriptor) {
            App.showNotification('Please capture your face first', 'warning');
            return;
        }
        
        // Check if username already exists
        const existingUser = registeredUsers.find(user => user.username === username);
        if (existingUser) {
            App.showNotification('Username already exists. Please choose a different username.', 'warning');
            return;
        }
        
        // Create new user
        const newUser = {
            username,
            employeeId,
            accessLevel,
            faceDescriptor: capturedDescriptor,
            registeredAt: new Date().toISOString(),
            lastLogin: null
        };
        
        // Add to registered users
        registeredUsers.push(newUser);
        
        // Save to local storage
        localStorage.setItem('ehrFaceUsers', JSON.stringify(registeredUsers));
        
        // Update face matcher
        createFaceMatcher();
        
        App.showNotification('Registration successful! You can now log in with facial recognition.', 'success');
        App.ActivityLogger.log('registration', { username, accessLevel });
        
        // Reset form
        document.getElementById('registrationForm').reset();
        clearCanvas(elements.registerCanvas);
        capturedDescriptor = null;
        elements.saveBtn.classList.add('hidden');
        
        // Go back to welcome
        App.navigateTo('welcome');
    }
    
    // Start face authentication process
    function startFaceAuthentication() {
        if (!faceMatcher || registeredUsers.length === 0) {
            elements.authStatus.innerHTML = '<div class="alert auth-failed">No registered users found. Please register first.</div>';
            return;
        }
        
        elements.authStatus.innerHTML = '<div class="alert auth-attempting">Scanning for face... Please look at the camera.</div>';
        
        loginCheckInterval = setInterval(async () => {
            try {
                const detections = await faceapi.detectSingleFace(
                    elements.loginVideo, 
                    new faceapi.TinyFaceDetectorOptions()
                ).withFaceLandmarks(true).withFaceDescriptor();
                
                if (!detections) {
                    return;
                }
                
                // Draw detection on canvas
                const displaySize = { 
                    width: elements.loginVideo.width || 640, 
                    height: elements.loginVideo.height || 480 
                };
                faceapi.matchDimensions(elements.loginCanvas, displaySize);
                
                const resizedDetections = faceapi.resizeResults(detections, displaySize);
                clearCanvas(elements.loginCanvas);
                
                faceapi.draw.drawDetections(elements.loginCanvas, resizedDetections);
                faceapi.draw.drawFaceLandmarks(elements.loginCanvas, resizedDetections);
                
                // Match face
                const match = faceMatcher.findBestMatch(detections.descriptor);
                console.log('Face match result:', match.toString());
                
                if (match.label !== 'unknown' && match.distance < 0.6) { // 0.6 is the threshold
                    // Stop checking
                    clearInterval(loginCheckInterval);
                    loginCheckInterval = null;
                    
                    elements.authStatus.innerHTML = '<div class="alert auth-success">Authentication successful!</div>';
                    
                    // Find user data
                    const authenticatedUser = registeredUsers.find(user => user.username === match.label);
                    
                    // Update last login
                    authenticatedUser.lastLogin = new Date().toISOString();
                    localStorage.setItem('ehrFaceUsers', JSON.stringify(registeredUsers));
                    
                    // Set current user
                    Session.setUser(authenticatedUser);
                    
                    // Log the login activity
                    App.ActivityLogger.log('login', { 
                        username: authenticatedUser.username,
                        accessLevel: authenticatedUser.accessLevel,
                        matchConfidence: 1 - match.distance
                    });
                    
                    // Navigate to EHR dashboard after delay
                    setTimeout(() => {
                        App.navigateTo('ehr');
                    }, 1500);
                    
                } else if (match.distance >= 0.4 && match.distance < 0.8) {
                    // Near match - show who it might be
                    elements.authStatus.innerHTML = `<div class="alert auth-attempting">Verifying identity... (Possible match: ${match.label})</div>`;
                }
                
            } catch (error) {
                console.error('Error during face authentication:', error);
            }
        }, 1000);
    }
    
    // Clear canvas
    function clearCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // Public methods
    return {
        init: loadModels,
        stopVideoStream,
        initRegistration,
        initLogin,
        captureFace,
        saveRegisteredUser
    };
})();

// Set up event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const captureBtn = document.getElementById('captureBtn');
    const saveBtn = document.getElementById('saveBtn');
    
    if (captureBtn) {
        captureBtn.addEventListener('click', FaceAuth.captureFace);
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', FaceAuth.saveRegisteredUser);
    }
});