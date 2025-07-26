import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const uploadDuration = new Trend('upload_duration');
const processingDuration = new Trend('processing_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users
    { duration: '5m', target: 50 }, // Stay at 50 users
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 }, // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.05'], // Error rate must be below 5%
    errors: ['rate<0.1'], // Custom error rate below 10%
    upload_duration: ['p(95)<5000'], // 95% of uploads complete in 5s
    processing_duration: ['p(95)<30000'], // 95% of processing complete in 30s
  },
};

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000/api';

// Test data
const testUsers = [
  { email: 'user1@test.com', password: 'testpass123' },
  { email: 'user2@test.com', password: 'testpass123' },
  { email: 'user3@test.com', password: 'testpass123' },
];

// Sample image data (base64 encoded small test image)
const testImageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function setup() {
  // Create test users if they don't exist
  testUsers.forEach(user => {
    const registerResponse = http.post(`${API_BASE_URL}/auth/register`, {
      name: `Test User ${user.email}`,
      email: user.email,
      password: user.password,
    });
    
    if (registerResponse.status !== 201 && registerResponse.status !== 409) {
      console.error(`Failed to create user ${user.email}: ${registerResponse.status}`);
    }
  });
  
  return { testUsers };
}

export default function(data) {
  const user = data.testUsers[Math.floor(Math.random() * data.testUsers.length)];
  
  // Login
  const loginResponse = http.post(`${API_BASE_URL}/auth/login`, {
    email: user.email,
    password: user.password,
  });
  
  const loginSuccess = check(loginResponse, {
    'login successful': (r) => r.status === 200,
    'login response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  if (!loginSuccess) {
    errorRate.add(1);
    return;
  }
  
  const authToken = loginResponse.json('data.token');
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };
  
  // Test scenarios with different weights
  const scenario = Math.random();
  
  if (scenario < 0.4) {
    // 40% - Upload and process workflow
    testUploadWorkflow(headers);
  } else if (scenario < 0.7) {
    // 30% - Browse projects
    testProjectBrowsing(headers);
  } else if (scenario < 0.9) {
    // 20% - Export functionality
    testExportFunctionality(headers);
  } else {
    // 10% - Heavy processing simulation
    testHeavyProcessing(headers);
  }
  
  sleep(1);
}

function testUploadWorkflow(headers) {
  // Create a new project
  const projectResponse = http.post(`${API_BASE_URL}/projects`, {
    name: `Load Test Project ${Date.now()}`,
    description: 'Performance test project',
  }, { headers });
  
  const projectSuccess = check(projectResponse, {
    'project created': (r) => r.status === 201,
  });
  
  if (!projectSuccess) {
    errorRate.add(1);
    return;
  }
  
  const projectId = projectResponse.json('data.id');
  
  // Upload file
  const uploadStart = Date.now();
  const uploadResponse = http.post(`${API_BASE_URL}/upload`, {
    projectId: projectId,
    files: [{
      filename: 'test-image.png',
      data: testImageData,
      mimeType: 'image/png',
    }],
  }, { headers });
  
  const uploadEnd = Date.now();
  uploadDuration.add(uploadEnd - uploadStart);
  
  const uploadSuccess = check(uploadResponse, {
    'upload successful': (r) => r.status === 200,
    'upload response time < 5s': (r) => r.timings.duration < 5000,
  });
  
  if (!uploadSuccess) {
    errorRate.add(1);
    return;
  }
  
  const uploadId = uploadResponse.json('data.uploadId');
  
  // Poll processing status
  const processingStart = Date.now();
  let processingComplete = false;
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds max
  
  while (!processingComplete && attempts < maxAttempts) {
    sleep(1);
    attempts++;
    
    const statusResponse = http.get(`${API_BASE_URL}/processing/status/${uploadId}`, { headers });
    
    check(statusResponse, {
      'status check successful': (r) => r.status === 200,
    });
    
    if (statusResponse.status === 200) {
      const status = statusResponse.json('data.status');
      if (status === 'completed' || status === 'failed') {
        processingComplete = true;
        const processingEnd = Date.now();
        processingDuration.add(processingEnd - processingStart);
        
        if (status === 'failed') {
          errorRate.add(1);
        }
      }
    } else {
      errorRate.add(1);
      break;
    }
  }
  
  if (!processingComplete) {
    errorRate.add(1);
  }
}

function testProjectBrowsing(headers) {
  // Get projects list
  const projectsResponse = http.get(`${API_BASE_URL}/projects?page=1&limit=10`, { headers });
  
  check(projectsResponse, {
    'projects list loaded': (r) => r.status === 200,
    'projects response time < 1s': (r) => r.timings.duration < 1000,
  });
  
  if (projectsResponse.status === 200) {
    const projects = projectsResponse.json('data.projects');
    
    if (projects && projects.length > 0) {
      // Get details for a random project
      const randomProject = projects[Math.floor(Math.random() * projects.length)];
      const projectDetailResponse = http.get(`${API_BASE_URL}/projects/${randomProject.id}`, { headers });
      
      check(projectDetailResponse, {
        'project details loaded': (r) => r.status === 200,
        'project details response time < 2s': (r) => r.timings.duration < 2000,
      });
    }
  } else {
    errorRate.add(1);
  }
}

function testExportFunctionality(headers) {
  // Get projects to export
  const projectsResponse = http.get(`${API_BASE_URL}/projects?page=1&limit=5`, { headers });
  
  if (projectsResponse.status === 200) {
    const projects = projectsResponse.json('data.projects');
    
    if (projects && projects.length > 0) {
      const randomProject = projects[Math.floor(Math.random() * projects.length)];
      
      // Test PDF export
      const pdfExportResponse = http.post(`${API_BASE_URL}/export/pdf`, {
        projectId: randomProject.id,
        options: {
          includeSummary: true,
          includeImages: false,
        },
      }, { headers });
      
      check(pdfExportResponse, {
        'PDF export initiated': (r) => r.status === 200 || r.status === 202,
        'PDF export response time < 3s': (r) => r.timings.duration < 3000,
      });
      
      // Test CSV export
      const csvExportResponse = http.post(`${API_BASE_URL}/export/csv`, {
        projectId: randomProject.id,
        options: {
          includeMetadata: true,
        },
      }, { headers });
      
      check(csvExportResponse, {
        'CSV export initiated': (r) => r.status === 200 || r.status === 202,
        'CSV export response time < 2s': (r) => r.timings.duration < 2000,
      });
    }
  } else {
    errorRate.add(1);
  }
}

function testHeavyProcessing(headers) {
  // Simulate heavy processing by uploading multiple files
  const projectResponse = http.post(`${API_BASE_URL}/projects`, {
    name: `Heavy Load Test ${Date.now()}`,
    description: 'Heavy processing test',
  }, { headers });
  
  if (projectResponse.status === 201) {
    const projectId = projectResponse.json('data.id');
    
    // Upload multiple files
    const files = Array.from({ length: 3 }, (_, i) => ({
      filename: `heavy-test-${i}.png`,
      data: testImageData,
      mimeType: 'image/png',
    }));
    
    const uploadResponse = http.post(`${API_BASE_URL}/upload`, {
      projectId: projectId,
      files: files,
    }, { headers });
    
    check(uploadResponse, {
      'heavy upload successful': (r) => r.status === 200,
      'heavy upload response time < 10s': (r) => r.timings.duration < 10000,
    });
    
    if (uploadResponse.status !== 200) {
      errorRate.add(1);
    }
  } else {
    errorRate.add(1);
  }
}

export function teardown(data) {
  // Cleanup test data if needed
  console.log('Performance test completed');
}