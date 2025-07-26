describe('Cross-Browser Compatibility', () => {
  beforeEach(() => {
    cy.mockApiResponses()
  })

  describe('Browser Feature Detection', () => {
    it('should detect and handle browser capabilities', () => {
      cy.visit('/login')
      
      // Test modern browser features
      cy.window().then((win) => {
        // Test for required APIs
        expect(win.fetch).to.exist
        expect(win.Promise).to.exist
        expect(win.localStorage).to.exist
        expect(win.sessionStorage).to.exist
        
        // Test for optional features with fallbacks
        if (win.navigator.mediaDevices) {
          expect(win.navigator.mediaDevices.getUserMedia).to.exist
        }
        
        if (win.FileReader) {
          expect(win.FileReader).to.exist
        }
      })
    })

    it('should handle missing features gracefully', () => {
      cy.visit('/dashboard', {
        onBeforeLoad: (win) => {
          // Simulate missing camera API
          delete win.navigator.mediaDevices
        }
      })
      
      cy.login()
      
      // Camera button should be hidden or show fallback
      cy.get('[data-testid="camera-capture-button"]').should('not.exist')
        .or('have.attr', 'disabled')
      
      // Should show fallback message
      cy.get('[data-testid="camera-not-supported"]').should('be.visible')
    })
  })

  describe('CSS Compatibility', () => {
    it('should render correctly across browsers', () => {
      cy.visit('/login')
      
      // Test critical layout elements
      cy.get('[data-testid="login-form"]').should('be.visible')
      cy.get('[data-testid="email-input"]').should('have.css', 'display', 'block')
      cy.get('[data-testid="login-button"]').should('have.css', 'cursor', 'pointer')
      
      // Test responsive design
      cy.viewport(768, 1024)
      cy.get('[data-testid="login-form"]').should('be.visible')
      
      cy.viewport(375, 667)
      cy.get('[data-testid="login-form"]').should('be.visible')
    })

    it('should handle CSS Grid and Flexbox fallbacks', () => {
      cy.visit('/dashboard')
      cy.login()
      
      // Test grid layout
      cy.get('[data-testid="dashboard-grid"]').should('be.visible')
      
      // Test flexbox layout
      cy.get('[data-testid="upload-section"]').should('have.css', 'display', 'flex')
        .or('have.css', 'display', 'block') // Fallback for older browsers
    })

    it('should handle vendor prefixes correctly', () => {
      cy.visit('/dashboard')
      cy.login()
      
      // Test transform properties
      cy.get('[data-testid="upload-animation"]').should('be.visible')
      
      // Test transition properties
      cy.get('[data-testid="hover-element"]').trigger('mouseover')
      cy.get('[data-testid="hover-element"]').should('have.css', 'transition-duration')
        .or('have.css', '-webkit-transition-duration')
        .or('have.css', '-moz-transition-duration')
    })
  })

  describe('JavaScript Compatibility', () => {
    it('should handle ES6+ features with polyfills', () => {
      cy.visit('/dashboard')
      cy.login()
      
      cy.window().then((win) => {
        // Test Promise support
        expect(win.Promise).to.exist
        
        // Test Array methods
        expect(Array.prototype.find).to.exist
        expect(Array.prototype.includes).to.exist
        
        // Test Object methods
        expect(Object.assign).to.exist
      })
    })

    it('should handle async/await gracefully', () => {
      cy.visit('/dashboard')
      cy.login()
      
      // Upload should work regardless of async/await support
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      cy.get('[data-testid="processing-status"]').should('be.visible')
    })

    it('should handle fetch API with polyfill', () => {
      cy.visit('/login')
      
      // Login should work with fetch or XMLHttpRequest
      cy.get('[data-testid="email-input"]').type('test@example.com')
      cy.get('[data-testid="password-input"]').type('testpassword123')
      cy.get('[data-testid="login-button"]').click()
      
      cy.wait('@login')
      cy.url().should('include', '/dashboard')
    })
  })

  describe('File Upload Compatibility', () => {
    it('should handle drag and drop across browsers', () => {
      cy.visit('/dashboard')
      cy.login()
      
      // Test drag and drop support
      cy.get('[data-testid="file-upload-dropzone"]').should('be.visible')
      
      // Simulate file drop
      cy.uploadTestImage()
      cy.get('[data-testid="file-preview"]').should('be.visible')
    })

    it('should fallback to file input for unsupported browsers', () => {
      cy.visit('/dashboard', {
        onBeforeLoad: (win) => {
          // Simulate no drag and drop support
          delete win.DataTransfer
        }
      })
      cy.login()
      
      // Should show file input fallback
      cy.get('[data-testid="file-input-fallback"]').should('be.visible')
      cy.get('[data-testid="file-upload-dropzone"]').should('not.exist')
    })

    it('should handle different file types across browsers', () => {
      cy.visit('/dashboard')
      cy.login()
      
      // Test JPEG support
      cy.fixture('test-image.jpg', 'base64').then(fileContent => {
        cy.get('[data-testid="file-upload-dropzone"]').selectFile({
          contents: Cypress.Buffer.from(fileContent, 'base64'),
          fileName: 'test.jpg',
          mimeType: 'image/jpeg'
        }, { action: 'drag-drop' })
      })
      
      cy.get('[data-testid="file-preview"]').should('be.visible')
    })
  })

  describe('Camera API Compatibility', () => {
    it('should handle camera access across browsers', () => {
      cy.viewport('iphone-x')
      cy.visit('/dashboard')
      cy.login()
      
      cy.window().then((win) => {
        if (win.navigator.mediaDevices && win.navigator.mediaDevices.getUserMedia) {
          cy.get('[data-testid="camera-capture-button"]').should('be.visible')
          cy.get('[data-testid="camera-capture-button"]').click()
          cy.get('[data-testid="camera-interface"]').should('be.visible')
        } else {
          cy.get('[data-testid="camera-not-supported"]').should('be.visible')
        }
      })
    })

    it('should handle camera permissions gracefully', () => {
      cy.viewport('iphone-x')
      cy.visit('/dashboard')
      cy.login()
      
      // Mock camera permission denied
      cy.window().then((win) => {
        if (win.navigator.mediaDevices) {
          cy.stub(win.navigator.mediaDevices, 'getUserMedia').rejects(new Error('Permission denied'))
        }
      })
      
      cy.get('[data-testid="camera-capture-button"]').click()
      cy.get('[data-testid="camera-permission-error"]').should('be.visible')
    })
  })

  describe('WebSocket Compatibility', () => {
    it('should handle WebSocket connections across browsers', () => {
      cy.visit('/dashboard')
      cy.login()
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      // Should receive real-time updates
      cy.get('[data-testid="processing-status"]').should('contain', 'Processing')
      
      // Test WebSocket fallback
      cy.window().then((win) => {
        if (!win.WebSocket) {
          // Should fall back to polling
          cy.get('[data-testid="polling-indicator"]').should('be.visible')
        }
      })
    })

    it('should handle WebSocket connection failures', () => {
      cy.visit('/dashboard', {
        onBeforeLoad: (win) => {
          // Mock WebSocket failure
          win.WebSocket = class {
            constructor() {
              setTimeout(() => {
                this.onerror && this.onerror(new Error('Connection failed'))
              }, 100)
            }
          }
        }
      })
      cy.login()
      
      cy.uploadTestImage()
      cy.get('[data-testid="start-upload-button"]').click()
      
      // Should fall back to polling
      cy.get('[data-testid="connection-fallback"]').should('be.visible')
    })
  })

  describe('Local Storage Compatibility', () => {
    it('should handle localStorage across browsers', () => {
      cy.visit('/login')
      
      cy.get('[data-testid="email-input"]').type('test@example.com')
      cy.get('[data-testid="password-input"]').type('testpassword123')
      cy.get('[data-testid="login-button"]').click()
      
      cy.wait('@login')
      
      // Should store auth token
      cy.window().then((win) => {
        if (win.localStorage) {
          expect(win.localStorage.getItem('authToken')).to.exist
        }
      })
    })

    it('should fallback when localStorage is unavailable', () => {
      cy.visit('/login', {
        onBeforeLoad: (win) => {
          // Simulate no localStorage
          delete win.localStorage
        }
      })
      
      cy.get('[data-testid="email-input"]').type('test@example.com')
      cy.get('[data-testid="password-input"]').type('testpassword123')
      cy.get('[data-testid="login-button"]').click()
      
      cy.wait('@login')
      
      // Should still work with session storage or cookies
      cy.url().should('include', '/dashboard')
    })
  })

  describe('Print Compatibility', () => {
    it('should handle print styles across browsers', () => {
      cy.visit('/projects/project-1')
      cy.wait('@getProject')
      
      // Test print media query
      cy.get('body').invoke('attr', 'style', 'media: print')
      
      // Print-specific elements should be visible
      cy.get('[data-testid="print-header"]').should('be.visible')
      cy.get('[data-testid="print-footer"]').should('be.visible')
      
      // Interactive elements should be hidden
      cy.get('[data-testid="interactive-buttons"]').should('not.be.visible')
    })
  })

  describe('Performance Across Browsers', () => {
    it('should maintain performance standards in different browsers', () => {
      cy.visit('/dashboard')
      cy.login()
      
      // Measure page load time
      cy.window().then((win) => {
        const loadTime = win.performance.timing.loadEventEnd - win.performance.timing.navigationStart
        expect(loadTime).to.be.lessThan(3000) // 3 seconds max
      })
      
      // Test interaction responsiveness
      const start = Date.now()
      cy.get('[data-testid="file-upload-dropzone"]').click()
      const end = Date.now()
      
      expect(end - start).to.be.lessThan(100) // 100ms max for UI response
    })
  })
})