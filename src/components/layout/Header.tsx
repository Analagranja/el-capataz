import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">Tu Logo</h1>
          </div>

          <nav className="hidden md:flex space-x-8">
            <a href="#" className="text-gray-700 hover:text-blue-600 transition-colors">
              Inicio
            </a>
            <a href="#" className="text-gray-700 hover:text-blue-600 transition-colors">
              Servicios
            </a>
            <a href="#" className="text-gray-700 hover:text-blue-600 transition-colors">
              Contacto
            </a>
          </nav>

          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isMenuOpen && (
          <nav className="md:hidden py-4 space-y-2 border-t border-gray-200">
            <a href="#" className="block py-2 text-gray-700 hover:text-blue-600">
              Inicio
            </a>
            <a href="#" className="block py-2 text-gray-700 hover:text-blue-600">
              Servicios
            </a>
            <a href="#" className="block py-2 text-gray-700 hover:text-blue-600">
              Contacto
            </a>
          </nav>
        )}
      </div>
    </header>
  );
}
