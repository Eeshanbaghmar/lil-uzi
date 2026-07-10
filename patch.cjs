const fs = require('fs');
const path = require('path');
const files = [
  'src/features/mixing/Mixing.jsx',
  'src/features/mastering/Mastering.jsx',
  'src/features/samples/Samples.jsx',
  'src/features/collaboration/Collaboration.jsx',
  'src/features/release/Release.jsx'
];

files.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.includes('WipBadge')) {
      // Add import
      content = content.replace(/(import .* from 'react'.*\n)/, "$1import WipBadge from '../../components/WipBadge';\n");
      
      // Inject badge under the first h1 header container, or after the main wrapper
      content = content.replace(/(<h1[^>]*>.*?<\/h1>[\s\S]*?<\/div>)/, "$1\n        <WipBadge />");
      
      fs.writeFileSync(filePath, content);
      console.log('Updated ' + file);
    }
  } else {
    console.log('File not found: ' + file);
  }
});
