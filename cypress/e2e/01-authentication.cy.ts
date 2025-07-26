describe('Authentication Flow', () => {
  beforeEach(() => {
    cy.mockApiResponses()
  })

  describe('User Registration', () => {
    it('should allow new user registration', () => {
      cy.visit('/register')
      
      // Fill registration form
      cy.get('[data-testid="name-input"]').type('New User')
      cy.get('[data-testid="email-input"]').type('newuser@example.com')
      cy.get('[data-testid="password-input"]').type('securepassword123')
      cy.get('[data-testid="confirm-password-input"]').type('securepassword123')
      
      // Submit registration
      cy.get('[data-testid="register-button"]').click()
      cy.wait('@register')
      
      // Should redirect to dashboard
      cy.url().should('include', '/dashboard')
      cy.get('[data-testid="welcome-message"]').should('contain', 'Welcome, New User')
    })

    it('should show validation errors for invalid input', () => {
      cy.visit('/register')
      
      // Try to submit empty form
      cy.get('[data-testid="register-button"]').click()
      
      // Should show validation errors
      cy.get('[data-testid="name-error"]').should('contain', 'Name is required')
      cy.get('[data-testid="email-error"]').should('contain', 'Email is required')
      cy.get('[data-testid="password-error"]').should('contain', 'Password is required')
    })

    it('should validate password confirmation', () => {
      cy.visit('/register')
      
      cy.get('[data-testid="name-input"]').type('Test User')
      cy.get('[data-testid="email-input"]').type('test@example.com')
      cy.get('[data-testid="password-input"]').type('password123')
      cy.get('[data-testid="confirm-password-input"]').type('differentpassword')
      
      cy.get('[data-testid="register-button"]').click()
      
      cy.get('[data-testid="confirm-password-error"]')
        .should('contain', 'Passwords do not match')
    })
  })

  describe('User Login', () => {
    it('should allow user login with valid credentials', () => {
      cy.visit('/login')
      
      cy.get('[data-testid="email-input"]').type('test@example.com')
      cy.get('[data-testid="password-input"]').type('testpassword123')
      cy.get('[data-testid="login-button"]').click()
      
      cy.wait('@login')
      cy.url().should('include', '/dashboard')
    })

    it('should show error for invalid credentials', () => {
      cy.intercept('POST', '/api/auth/login', {
        statusCode: 401,
        body: { success: false, error: 'Invalid credentials' }
      }).as('loginFailed')
      
      cy.visit('/login')
      
      cy.get('[data-testid="email-input"]').type('wrong@example.com')
      cy.get('[data-testid="password-input"]').type('wrongpassword')
      cy.get('[data-testid="login-button"]').click()
      
      cy.wait('@loginFailed')
      cy.get('[data-testid="error-message"]').should('contain', 'Invalid credentials')
    })

    it('should redirect to login when accessing protected routes', () => {
      cy.visit('/dashboard')
      cy.url().should('include', '/login')
    })
  })

  describe('User Logout', () => {
    it('should allow user to logout', () => {
      cy.login()
      
      cy.get('[data-testid="user-menu"]').click()
      cy.get('[data-testid="logout-button"]').click()
      
      cy.url().should('include', '/login')
      cy.get('[data-testid="login-form"]').should('be.visible')
    })
  })

  describe('Accessibility', () => {
    it('should be accessible on login page', () => {
      cy.visit('/login')
      cy.checkAccessibility()
    })

    it('should be accessible on registration page', () => {
      cy.visit('/register')
      cy.checkAccessibility()
    })
  })
})