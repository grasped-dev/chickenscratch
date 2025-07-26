import { Link } from 'react-router-dom'

const HomePage = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Chicken Scratch
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Transform physical notes into actionable digital insights
        </p>
        <div className="space-x-4">
          <Link to="/upload" className="btn-primary">
            Start Upload
          </Link>
          <Link to="/projects" className="btn-secondary">
            View Projects
          </Link>
        </div>
      </div>
    </div>
  )
}

export default HomePage