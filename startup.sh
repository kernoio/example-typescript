#!/bin/sh
npx prisma generate 
npx prisma migrate dev 
node main.js
