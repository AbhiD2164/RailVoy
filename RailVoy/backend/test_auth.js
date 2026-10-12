const express = require('express');

const app = express();
app.use(express.json());

const { connectDB } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

(async () => {
  await connectDB();
  const server = app.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/auth`;
  console.log(`Test server running on port ${port}`);

  async function post(endpoint, data) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    return { status: res.status, data: json };
  }

  try {
    console.log('\n--- 1. Testing Direct Password Login ---');
    const loginRes = await post('/login', {
      email: 'admin@railvoy.com',
      password: 'admin123',
      requireOtp: false
    });
    console.log('Status:', loginRes.status);
    console.log('Login Result:', loginRes.data.message);
    console.log('Has Token:', !!loginRes.data.token);
    console.log('User:', loginRes.data.user?.name, loginRes.data.user?.email);
    if (loginRes.status !== 200 || !loginRes.data.token) {
      throw new Error('Direct password login failed');
    }

    console.log('\n--- 2. Testing OTP Login Request ---');
    const otpReqRes = await post('/login-otp-request', {
      email: 'admin@railvoy.com'
    });
    console.log('Status:', otpReqRes.status);
    console.log('Message:', otpReqRes.data.message);
    if (otpReqRes.status !== 200) {
      throw new Error('OTP login request failed');
    }

    console.log('\n--- 3. Testing Google 1-Click Direct Sign-In ---');
    const googleRes = await post('/google-direct', {
      email: 'alex.passenger@gmail.com',
      name: 'Alex Mercer',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'
    });
    console.log('Status:', googleRes.status);
    console.log('Google Auth Message:', googleRes.data.message);
    console.log('Has Token:', !!googleRes.data.token);
    console.log('Auto-Created Bank Account:', googleRes.data.user?.bankAccountNo, googleRes.data.user?.bankName);
    if (googleRes.status !== 200 || !googleRes.data.token || !googleRes.data.user?.bankAccountNo) {
      throw new Error('Google direct sign-in failed');
    }

    console.log('\n--- 4. Testing Forgot Password Flow ---');
    const forgotRes = await post('/forgot-password', {
      email: 'alex.passenger@gmail.com'
    });
    console.log('Forgot Password Status:', forgotRes.status);
    console.log('Message:', forgotRes.data.message);
    if (forgotRes.status !== 200) {
      throw new Error('Forgot password request failed');
    }

    console.log('\n>>> ALL AUTH TESTS PASSED SUCCESSFULLY! <<<');
  } catch (err) {
    console.error('Test Failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
})();
