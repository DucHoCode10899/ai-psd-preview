"use client";

import { useState, useEffect } from 'react';
import { Loader2, Cpu } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Define aspect ratio sequence
const ASPECT_RATIOS = [
  { width: 1, height: 1, name: "1:1" },
  { width: 16, height: 9, name: "16:9" },
  { width: 5, height: 4, name: "5:4" },
  { width: 9, height: 16, name: "9:16" }
];

export default function PasswordProtection({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentRatioIndex, setCurrentRatioIndex] = useState(0);

  useEffect(() => {
    const authenticated = sessionStorage.getItem('isAuthenticated');
    if (authenticated === 'true') {
      setIsAuthenticated(true);
    }

    // Start aspect ratio animation cycle
    const interval = setInterval(() => {
      setCurrentRatioIndex((prev) => (prev + 1) % ASPECT_RATIOS.length);
    }, 3000); // Change ratio every 3 seconds

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    await new Promise(resolve => setTimeout(resolve, 800));

    if (password === 'Digitas@2025') {
      setIsAuthenticated(true);
      sessionStorage.setItem('isAuthenticated', 'true');
    } else {
      setError('Incorrect password. Please try again.');
    }
    setIsLoading(false);
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Calculate current aspect ratio dimensions
  const currentRatio = ASPECT_RATIOS[currentRatioIndex];
  const baseSize = 140; // Base size for scaling
  const containerSize = {
    width: baseSize,
    height: baseSize * (currentRatio.height / currentRatio.width)
  };

  // If ratio is vertical (height > width), adjust dimensions
  if (currentRatio.height > currentRatio.width) {
    containerSize.width = baseSize * (currentRatio.width / currentRatio.height);
    containerSize.height = baseSize;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-400 to-blue-800">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md mx-4"
      >
        <Card className="border-0 shadow-2xl bg-white/90 backdrop-blur-sm">
          <CardHeader className="space-y-3 text-center">
            {/* AI Layout Animation Container */}
            <div className="flex justify-center items-center h-[140px]">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ 
                  scale: 1,
                  width: containerSize.width,
                  height: containerSize.height
                }}
                transition={{ 
                  type: "spring",
                  stiffness: 260,
                  damping: 20,
                  delay: 0.2
                }}
                className="relative bg-gradient-to-tr from-blue-50 to-blue-100 rounded-xl overflow-hidden"
              >
                {/* Aspect Ratio Indicator */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="absolute top-1 left-1 text-[10px] text-blue-500/70 font-mono"
                >
                  {currentRatio.name}
                </motion.div>

                {/* Grid Background */}
                <motion.div 
                  className="absolute inset-0 grid grid-cols-4 grid-rows-4 gap-px opacity-20"
                  animate={{
                    opacity: [0.1, 0.3, 0.1],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                >
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className="bg-blue-500" />
                  ))}
                </motion.div>

                {/* Layout Elements */}
                <motion.div
                  className="absolute inset-3 flex flex-col gap-2"
                  animate={{
                    opacity: [1, 0.7, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  {/* Header - Adapts to container width */}
                  <motion.div
                    className="h-[10%] bg-blue-500/30 rounded"
                    animate={{
                      width: ["60%", "80%", "60%"],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                  
                  {/* Content - Fills available space */}
                  <motion.div
                    className="flex-1 bg-blue-500/20 rounded"
                    animate={{
                      scale: [1, 1.02, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                  
                  {/* Footer - Adapts to container width */}
                  <motion.div
                    className="h-[8%] bg-blue-500/30 rounded"
                    animate={{
                      width: ["40%", "60%", "40%"],
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                </motion.div>

                {/* AI Processing Indicators */}
                <motion.div
                  className="absolute top-2 right-2 flex items-center justify-center"
                  animate={{
                    rotate: 360
                  }}
                  transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                >
                  <Cpu className="w-4 h-4 text-blue-500/50" />
                </motion.div>
              </motion.div>
            </div>

            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
              PSD Layout AI
            </CardTitle>
            <CardDescription className="text-gray-500">
              Enter the password to access the layout generator
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className={cn(
                      "pr-10",
                      error && "border-red-500 focus-visible:ring-red-500"
                    )}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Alert variant="destructive" className="text-sm">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !password}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="text-center text-sm text-muted-foreground">
            <div className="w-full space-y-1">
              <p className="text-xs text-gray-400">Powered by Digitas VN</p>
            </div>
          </CardFooter>
        </Card>

        {/* Background animated shapes */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 90, 180, 270, 360],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "linear"
            }}
            className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-blue-400/20 to-transparent rounded-full"
          />
          <motion.div
            animate={{
              scale: [1.2, 1, 1.2],
              rotate: [360, 270, 180, 90, 0],
            }}
            transition={{
              duration: 25,
              repeat: Infinity,
              ease: "linear"
            }}
            className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-blue-600/20 to-transparent rounded-full"
          />
        </div>
      </motion.div>
    </div>
  );
}