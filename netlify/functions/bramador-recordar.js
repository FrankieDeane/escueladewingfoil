// Bramador — recordar que la persona ya dejó nombre, apellido y mail.
//
// localStorage se puede borrar solo (Safari lo limpia si no se abre la página
// en 7 días). Una cookie puesta por el servidor dura mucho más, así que la app
// y la web la usan de respaldo para no volver a pedir los datos.
const UN_ANIO = 400 * 24 * 3600; // tope de los navegadores para cookies

export default async (req) => {
  if (req.method !== 'POST') return new Response('', { status: 405 });
  return new Response('', {
    status: 204,
    headers: {
      'Set-Cookie': `bram_lead=1; Max-Age=${UN_ANIO}; Path=/; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store'
    }
  });
};

export const config = { path: '/api/bramador-recordar' };
