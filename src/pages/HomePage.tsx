import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Sparkles, Target, Zap } from 'lucide-react';

export default function HomePage() {
  return (
    <div>
      <section className="bg-gradient-to-br from-blue-50 to-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              Bienvenido a tu Proyecto
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Personaliza esta estructura con tus diseños de Figma
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button size="lg">Comenzar</Button>
              <Button variant="secondary" size="lg">Saber más</Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Características
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card hover>
              <div className="flex flex-col items-center text-center">
                <div className="bg-blue-100 p-4 rounded-full mb-4">
                  <Sparkles className="text-blue-600" size={32} />
                </div>
                <h3 className="text-xl font-semibold mb-2">Característica 1</h3>
                <p className="text-gray-600">
                  Descripción de la primera característica
                </p>
              </div>
            </Card>

            <Card hover>
              <div className="flex flex-col items-center text-center">
                <div className="bg-blue-100 p-4 rounded-full mb-4">
                  <Target className="text-blue-600" size={32} />
                </div>
                <h3 className="text-xl font-semibold mb-2">Característica 2</h3>
                <p className="text-gray-600">
                  Descripción de la segunda característica
                </p>
              </div>
            </Card>

            <Card hover>
              <div className="flex flex-col items-center text-center">
                <div className="bg-blue-100 p-4 rounded-full mb-4">
                  <Zap className="text-blue-600" size={32} />
                </div>
                <h3 className="text-xl font-semibold mb-2">Característica 3</h3>
                <p className="text-gray-600">
                  Descripción de la tercera característica
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
