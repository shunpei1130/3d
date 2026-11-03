import type { NextConfig } from 'next';
const config:NextConfig={serverExternalPackages:['@jscad/modeling','@jscad/stl-serializer'],outputFileTracingIncludes:{'/api/email':['./public/fonts/*.ttf']},async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'}]}]}};
export default config;
