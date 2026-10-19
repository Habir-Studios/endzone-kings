#!/bin/sh
# Run before pushing an update so players' browsers load the new files right away.
V=$(date +%s)
for f in js/*.js; do sed -i -E "s#from '\./([a-z]+)\.js(\?v=[0-9]+)?'#from './\1.js?v=$V'#g" "$f"; done
sed -i "s#src=\"js/main.js[^\"]*\"#src=\"js/main.js?v=$V\"#" index.html
echo "{\"v\":$V}" > version.json   # running games check this and reload themselves to the new version
echo "version $V"
sed -i "s#href=\"css/style.css[^\"]*\"#href=\"css/style.css?v=$V\"#" index.html
sed -i "s#href=\"css/theme.css[^\"]*\"#href=\"css/theme.css?v=$V\"#" index.html
