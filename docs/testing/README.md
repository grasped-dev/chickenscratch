# Chicken Scratch Testing Documentation

This document provides comprehensive information about the testing strategy, test suites, and quality assurance processes for the Chicken Scratch application.

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Test Types](#test-types)
3. [Running Tests](#running-tests)
4. [Test Coverage](#test-coverage)
5. [Continuous Integration](#continuous-integration)
6. [User Acceptance Testing](#user-acceptance-testing)
7. [Performance Testing](#performance-testing)
8. [Accessibility Testing](#accessibility-testing)
9. [Cross-Browser Testing](#cross-browser-testing)
10. [Mobile Testing](#mobile-testing)

## Testing Strategy

Our testing strategy follows a comprehensive approach covering multiple layers:

### Test Pyramid

```
    /\
   /  \    E2E Tests (Cypress)
  /____\   
 /      \   Integration Tests (Vitest)
/________\  
           Unit Tests (Vitest + Testing Library)
```

- **Unit Tests (70%)**: Fast, isolated tests for individual components and functions
- **Integration Tests (20%)**: Tests for component interactions and API endpoints
- **End-to-End Tests (10%)**: Full user workflow tests across the entire application

### Quality Gates

All code must pass the following quality gates before deployment:

- ✅ Unit test coverage > 90%
- ✅ Integration test coverage > 80%
- ✅ E2E tests passing
- ✅ Accessibility compliance (WCAG 2.1 AA)
- ✅ Performance benchmarks met
- ✅ Cross-browser compatibility verified
- ✅ Security scan passed

## Test Types

### 1. Unit Tests

**Location**: `backend/src/test/`, `frontend/src/components/**/__tests__/`
**Framework**: Vitest + Testing Library
**Purpose**: Test individual functions, components, and services in isolation

```bash
# Run backend unit tests
cd backend && npm test

# Run frontend unit tests
cd frontend && npm test

# Run with coverage
npm test -- --coverage
```

### 2. Integration Tests

**Location**: `backend/tests/integration/`
**Framework**: Vitest + Supertest
**Purpose**: Test API endpoints, database interactions, and service integrations

```bash
# Run integration tests
cd backend && npm run test:integration
```

### 3. End-to-End Tests

**Location**: `cypress/e2e/`
**Framework**: Cypress
**Purpose**: Test complete user workflows from browser perspective

```bash
# Run E2E tests headlessly
cd frontend && npm run test:e2e

# Open Cypress Test Runner
cd frontend && npm run test:e2e:open
```

### 4. Performance Tests

**Location**: `tests/performance/`
**Framework**: k6
**Purpose**: Load testing and performance benchmarking

```bash
# Run performance tests
k6 run tests/performance/load-test.js
```

### 5. Accessibility Tests

**Location**: `cypress/e2e/accessibility.cy.ts`
**Framework**: Cypress + axe-core
**Purpose**: WCAG 2.1 AA compliance testing

```bash
# Run accessibility tests
cd frontend && npx cypress run --spec "cypress/e2e/accessibility.cy.ts"
```

## Running Tests

### Local Development

```bash
# Install dependencies
npm install

# Run all tests
npm run test:all

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:performance
npm run test:accessibility
```

### Docker Environment

```bash
# Run tests in Docker
docker-compose -f docker-compose.test.yml up --build

# Run specific test suite
docker-compose -f docker-compose.test.yml run frontend npm run test:e2e
```

### CI/CD Pipeline

Tests are automatically run on:
- Every pull request
- Pushes to main/develop branches
- Nightly scheduled runs
- Before deployments

## Test Coverage

### Coverage Requirements

- **Backend**: Minimum 90% line coverage
- **Frontend**: Minimum 85% line coverage
- **Critical paths**: 100% coverage required

### Coverage Reports

Coverage reports are generated automatically and available at:
- Local: `coverage/lcov-report/index.html`
- CI: Uploaded to Codecov

### Viewing Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open coverage report
open coverage/lcov-report/index.html
```

## Continuous Integration

### GitHub Actions Workflows

1. **Main CI Pipeline** (`.github/workflows/ci.yml`)
   - Lint checking
   - Unit tests
   - Integration tests
   - E2E tests
   - Security scanning
   - Build verification

2. **Performance Testing** (`.github/workflows/performance-tests.yml`)
   - Load testing with k6
   - Lighthouse performance audits
   - Performance regression detection

3. **Cross-Browser Testing** (`.github/workflows/cross-browser-tests.yml`)
   - Chrome, Firefox, Safari, Edge testing
   - Mobile device testing
   - Visual regression testing

### Quality Gates

Each PR must pass all quality gates:

```yaml
Required Checks:
- ✅ Lint (ESLint + TypeScript)
- ✅ Unit Tests (90%+ coverage)
- ✅ Integration Tests (80%+ coverage)
- ✅ E2E Tests (All scenarios)
- ✅ Accessibility Tests (WCAG 2.1 AA)
- ✅ Security Scan (No high/critical issues)
- ✅ Performance Tests (Within thresholds)
```

## User Acceptance Testing

### UAT Scenarios

User Acceptance Test scenarios are documented in `docs/testing/uat-scenarios.md` and cover:

1. **Authentication Workflows**
   - User registration and login
   - Password reset and recovery
   - Session management

2. **Upload and Processing**
   - Image upload from desktop
   - Camera capture on mobile
   - OCR text extraction
   - Error handling

3. **Content Analysis**
   - Automatic clustering
   - Manual cluster adjustment
   - Theme labeling
   - Text editing

4. **Results and Export**
   - Summary generation
   - PDF export
   - CSV export
   - Project management

5. **Cross-Platform Compatibility**
   - Desktop browsers
   - Mobile devices
   - Tablet interfaces

### UAT Execution

```bash
# Run UAT test suite
cd frontend && npx cypress run --spec "cypress/e2e/uat-*.cy.ts"

# Generate UAT report
npm run test:uat:report
```

## Performance Testing

### Performance Benchmarks

| Metric | Target | Threshold |
|--------|--------|-----------|
| Page Load Time | < 2s | < 3s |
| API Response Time | < 500ms | < 1s |
| OCR Processing | < 10s | < 15s |
| File Upload | < 5s | < 10s |
| Clustering | < 30s | < 60s |

### Load Testing Scenarios

1. **Normal Load**: 50 concurrent users
2. **Peak Load**: 100 concurrent users
3. **Stress Test**: 200+ concurrent users
4. **Spike Test**: Sudden traffic increases

### Running Performance Tests

```bash
# Run load tests
k6 run tests/performance/load-test.js

# Run with custom parameters
K6_VUS=100 K6_DURATION=10m k6 run tests/performance/load-test.js

# Generate performance report
npm run test:performance:report
```

## Accessibility Testing

### WCAG 2.1 AA Compliance

Our accessibility testing ensures compliance with:

- **Perceivable**: Color contrast, text alternatives, captions
- **Operable**: Keyboard navigation, focus management, timing
- **Understandable**: Readable text, predictable functionality
- **Robust**: Compatible with assistive technologies

### Accessibility Test Coverage

- ✅ Color contrast ratios (4.5:1 minimum)
- ✅ Keyboard navigation support
- ✅ Screen reader compatibility
- ✅ Focus management
- ✅ ARIA labels and roles
- ✅ Form accessibility
- ✅ Error message accessibility

### Running Accessibility Tests

```bash
# Run accessibility test suite
cd frontend && npx cypress run --spec "cypress/e2e/accessibility.cy.ts"

# Run axe-core audit
npm run test:a11y

# Generate accessibility report
npm run test:a11y:report
```

## Cross-Browser Testing

### Supported Browsers

| Browser | Desktop | Mobile | Tablet |
|---------|---------|--------|--------|
| Chrome | ✅ | ✅ | ✅ |
| Firefox | ✅ | ✅ | ✅ |
| Safari | ✅ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ |

### Browser-Specific Testing

```bash
# Run tests on specific browsers
cd frontend && npx cypress run --browser chrome
cd frontend && npx cypress run --browser firefox
cd frontend && npx cypress run --browser edge

# Run cross-browser test suite
npm run test:cross-browser
```

### Visual Regression Testing

Visual regression tests ensure UI consistency across browsers:

```bash
# Run visual regression tests
cd frontend && npx cypress run --spec "cypress/e2e/visual-regression.cy.ts"

# Update visual baselines
npm run test:visual:update
```

## Mobile Testing

### Supported Devices

- **Phones**: iPhone X/SE, Samsung Galaxy S10
- **Tablets**: iPad, Samsung Galaxy Tab
- **Orientations**: Portrait and landscape
- **Interactions**: Touch, swipe, pinch-to-zoom

### Mobile Test Execution

```bash
# Run mobile-specific tests
cd frontend && npx cypress run --spec "cypress/e2e/mobile-device-testing.cy.ts"

# Test specific device
cd frontend && npx cypress run --config viewportWidth=375,viewportHeight=667

# Run PWA tests
npm run test:pwa
```

## Test Data Management

### Test Fixtures

Test data is managed through Cypress fixtures:

- `cypress/fixtures/auth/` - Authentication data
- `cypress/fixtures/projects/` - Project data
- `cypress/fixtures/upload/` - Upload responses
- `cypress/fixtures/processing/` - Processing status

### Database Seeding

```bash
# Seed test database
cd backend && npm run db:seed:test

# Reset test database
cd backend && npm run db:reset:test
```

## Debugging Tests

### Local Debugging

```bash
# Run tests in debug mode
cd frontend && npx cypress open

# Run with verbose logging
DEBUG=cypress:* npm run test:e2e

# Run specific test file
cd frontend && npx cypress run --spec "cypress/e2e/specific-test.cy.ts"
```

### CI Debugging

When tests fail in CI:

1. Check GitHub Actions logs
2. Download test artifacts (screenshots, videos)
3. Review coverage reports
4. Check performance metrics

## Contributing to Tests

### Writing New Tests

1. Follow the existing test structure
2. Use descriptive test names
3. Include proper assertions
4. Add accessibility checks
5. Update documentation

### Test Guidelines

- **Unit Tests**: Test one thing at a time
- **Integration Tests**: Test component interactions
- **E2E Tests**: Test user workflows
- **Performance Tests**: Include realistic scenarios
- **Accessibility Tests**: Cover all user interactions

### Code Review Checklist

- [ ] Tests cover new functionality
- [ ] Tests are properly organized
- [ ] Test names are descriptive
- [ ] Assertions are meaningful
- [ ] Error cases are tested
- [ ] Accessibility is considered
- [ ] Performance impact is minimal

## Troubleshooting

### Common Issues

1. **Flaky Tests**: Add proper waits and assertions
2. **Slow Tests**: Optimize selectors and reduce unnecessary operations
3. **Browser Compatibility**: Check for browser-specific issues
4. **Mobile Issues**: Verify touch interactions and viewport settings

### Getting Help

- Check existing documentation
- Review similar test implementations
- Ask in team chat or create an issue
- Consult Cypress/Vitest documentation

## Resources

- [Cypress Documentation](https://docs.cypress.io/)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [k6 Documentation](https://k6.io/docs/)