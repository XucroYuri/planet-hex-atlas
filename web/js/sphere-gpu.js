// A single texture and fullscreen triangle move orthographic resampling off the UI thread.
// The map still composes overlays in Canvas 2D. Context failure returns control to its CPU renderer.
const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D surface;
uniform vec2 orientation;
uniform float longitude;
uniform float size;
out vec4 color;
void main() {
  vec2 p = 2.0 * gl_FragCoord.xy / size - 1.0;
  float radial = dot(p,p);
  if (radial > 1.0) { color = vec4(0.0); return; }
  float depth = sqrt(max(0.0,1.0-radial));
  float lat = asin(clamp(p.y*orientation.y+depth*orientation.x,-1.0,1.0));
  float lon = atan(p.x,depth*orientation.y-p.y*orientation.x);
  vec2 uv = vec2(fract(0.5+longitude+lon/6.28318530718),0.5-lat/3.14159265359);
  float light = 0.78 + 0.25*depth + 0.09*p.y - 0.07*p.x;
  vec3 rim = max(0.0,0.18-depth) * vec3(42.0,63.0,75.6) / 255.0;
  color = vec4(texture(surface,uv).rgb*light+rim,1.0);
}`;

export function createSphereGPU(invalidate) {
  const canvas=document.createElement('canvas');
  let gl;
  try {
    gl=canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,powerPreference:'low-power',failIfMajorPerformanceCaveat:true});
  } catch { return null; }
  if (!gl) return null;
  let lost=false;
  const program=gl.createProgram();
  const shaders=[];
  try {
    for (const [type,source] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,FRAGMENT]]) {
      const shader=gl.createShader(type);shaders.push(shader);
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error('Shader compilation failed');
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error('Shader link failed');
  } catch {
    gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  } finally { for (const shader of shaders) gl.deleteShader(shader); }
  gl.useProgram(program);
  const uniforms=Object.fromEntries(['surface','orientation','longitude','size'].map(k=>[k,gl.getUniformLocation(program,k)]));
  const texture=gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.uniform1i(uniforms.surface,0);
  canvas.addEventListener('webglcontextlost',()=>{ lost=true; invalidate(); });
  let lastSurface;
  return {
    render(diameter,latitude,longitude,surface,revision) {
      if (lost || gl.isContextLost()) return null;
      if (canvas.width!==diameter || canvas.height!==diameter) {canvas.width=diameter; canvas.height=diameter;}
      if (lastSurface!==revision) {
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,surface);
        lastSurface=revision;
      }
      const phi=latitude*Math.PI/180;
      gl.viewport(0,0,diameter,diameter);
      gl.uniform2f(uniforms.orientation,Math.sin(phi),Math.cos(phi));
      gl.uniform1f(uniforms.longitude,longitude/360);
      gl.uniform1f(uniforms.size,diameter);
      gl.drawArrays(gl.TRIANGLES,0,3);
      return canvas;
    },
  };
}
