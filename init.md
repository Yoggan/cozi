Next steps
   1. cd cozi                                                                              
   2. pnpm run dev:setup                                                                   
      (this will guide you through Convex project setup)                                   
   3. Copy environment variables from                                                      
      packages/backend/.env.local to apps/*/.env                                           
   4. pnpm run dev                                                                         
                                                                                           
                                                                                           
   Local development                                                                       
   Frontend  http://localhost:3001                                                         
                                                                                           
   NOTE: For Expo connectivity issues, update                                              
      apps/native/.env with your Convex deployment URL (find after running 'dev:setup'):   
      EXPO_PUBLIC_CONVEX_URL=https://example.convex.cloud                                  
                                                                                           
   IMPORTANT: When using local development with Convex and native apps,                    
      ensure you use your local IP address instead of localhost or 127.0.0.1               
      for proper connectivity.                                                             
                                                                                           
   Git hooks with Lefthook:                                                                
   - Install hooks: pnpm lefthook install                                                  
                                                                                           
   Linting and formatting:                                                                 
   - Run checks: pnpm run check                                                            
                                                                                           
   Better Auth + Convex Setup:                                                             
   - Configure the Convex deployment before setting env vars:                              
      pnpm run dev:setup                                                                   
   - Set environment variables from packages/backend:                                      
      cd packages/backend                                                                  
      pnpm convex env set BETTER_AUTH_SECRET=$(openssl rand -base64 32)                    
      pnpm convex env set SITE_URL http://localhost:3001                                   
                                                                                           
   Deploy web with Vercel Services:                                                        
   - Link project: pnpm run deploy:setup                                                   
   - Sync env (before first deploy): pnpm run env:production                               
   - Deploy: pnpm run deploy:prod                                                          
   - Guide: https://www.better-t-stack.dev/docs/guides/vercel