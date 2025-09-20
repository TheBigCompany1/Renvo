import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { insertEmailSignupSchema, type InsertEmailSignup } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Check, Mail, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmailSignupProps {
  /**
   * Source identifier for tracking where the signup came from
   */
  signupSource: string;
  
  /**
   * Optional report ID to link this email signup to a specific analysis report
   */
  reportId?: string;
  
  /**
   * Placeholder text for the email input
   * @default "Enter your email"
   */
  placeholder?: string;
  
  /**
   * Text for the submit button
   * @default "Subscribe"
   */
  buttonText?: string;
  
  /**
   * Text for the submit button when loading
   * @default "Subscribing..."
   */
  loadingText?: string;
  
  /**
   * Success message to display after successful signup
   * @default "Thanks! We'll keep you updated."
   */
  successMessage?: string;
  
  /**
   * Additional CSS classes for the container
   */
  className?: string;
  
  /**
   * Layout orientation
   * @default "vertical"
   */
  layout?: "vertical" | "horizontal";
  
  /**
   * Size variant for the component
   * @default "default"
   */
  size?: "sm" | "default" | "lg";
  
  /**
   * Style variant for different contexts
   * @default "default"
   */
  variant?: "default" | "minimal" | "card" | "inline";
  
  /**
   * Custom styling for different elements
   */
  styling?: {
    container?: string;
    input?: string;
    button?: string;
    successContainer?: string;
    description?: string;
  };
  
  /**
   * Optional description text to display above the form
   */
  description?: string;
  
  /**
   * Whether to show an icon in the button
   * @default true
   */
  showIcon?: boolean;
  
  /**
   * Custom success callback
   */
  onSuccess?: (email: string) => void;
  
  /**
   * Custom error callback
   */
  onError?: (error: Error) => void;
  
  /**
   * Whether to disable the component
   * @default false
   */
  disabled?: boolean;
  
  /**
   * Test ID prefix for testing
   * @default "email-signup"
   */
  testIdPrefix?: string;
}

export function EmailSignup({
  signupSource,
  reportId,
  placeholder = "Enter your email",
  buttonText = "Subscribe",
  loadingText = "Subscribing...",
  successMessage = "Thanks! We'll keep you updated.",
  className,
  layout = "vertical",
  size = "default",
  variant = "default",
  styling = {},
  description,
  showIcon = true,
  onSuccess,
  onError,
  disabled = false,
  testIdPrefix = "email-signup"
}: EmailSignupProps) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const form = useForm<InsertEmailSignup>({
    resolver: zodResolver(insertEmailSignupSchema),
    defaultValues: {
      email: "",
      signupSource,
      reportId
    }
  });

  const emailSignupMutation = useMutation({
    mutationFn: async (data: InsertEmailSignup) => {
      return apiRequest("POST", "/api/email-signups", data);
    },
    onSuccess: (_, variables) => {
      setIsSubmitted(true);
      toast({
        title: "Success!",
        description: successMessage
      });
      onSuccess?.(variables.email);
    },
    onError: (error) => {
      console.error("Email signup error:", error);
      toast({
        title: "Error",
        description: "Failed to sign up. Please try again.",
        variant: "destructive"
      });
      onError?.(error as Error);
    }
  });

  const handleEmailSubmit = (data: InsertEmailSignup) => {
    if (disabled) return;
    emailSignupMutation.mutate({ ...data, signupSource, reportId });
  };

  // Size-based styling
  const sizeClasses = {
    sm: {
      container: "space-y-2",
      input: "h-8 text-sm",
      button: "h-8 px-3 text-sm",
      text: "text-sm",
      icon: "w-3 h-3"
    },
    default: {
      container: "space-y-3",
      input: "h-10",
      button: "h-10 px-4",
      text: "text-base",
      icon: "w-4 h-4"
    },
    lg: {
      container: "space-y-4",
      input: "h-12 text-lg",
      button: "h-12 px-6 text-lg",
      text: "text-lg",
      icon: "w-5 h-5"
    }
  };

  const currentSize = sizeClasses[size];
  
  // Layout classes
  const layoutClasses = layout === "horizontal" 
    ? "flex flex-col sm:flex-row gap-2 sm:gap-3 items-end"
    : currentSize.container;

  // Variant-based styling
  const getVariantClasses = () => {
    switch (variant) {
      case "minimal":
        return {
          container: "space-y-2",
          input: "border-0 border-b border-gray-300 dark:border-gray-600 rounded-none bg-transparent focus:border-primary",
          button: "bg-primary hover:bg-primary/90"
        };
      case "card":
        return {
          container: "p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-lg border shadow-sm",
          input: "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600",
          button: "w-full bg-primary hover:bg-primary/90"
        };
      case "inline":
        return {
          container: "inline-flex items-center gap-2",
          input: "flex-1 min-w-0",
          button: "shrink-0"
        };
      default:
        return {
          container: "",
          input: "",
          button: ""
        };
    }
  };

  const variantClasses = getVariantClasses();

  if (isSubmitted) {
    return (
      <div 
        className={cn(
          "text-center",
          variant === "card" ? "p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-lg border shadow-sm" : "",
          styling.successContainer,
          className
        )}
        data-testid={`${testIdPrefix}-success`}
      >
        <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
          <Check className={cn(currentSize.icon, "shrink-0")} data-testid={`${testIdPrefix}-success-icon`} />
          <p className={cn("font-medium", currentSize.text)} data-testid={`${testIdPrefix}-success-message`}>
            {successMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        variantClasses.container,
        variant !== "inline" && layoutClasses,
        styling.container,
        className
      )}
      data-testid={`${testIdPrefix}-container`}
    >
      {description && (
        <p 
          className={cn(
            "text-gray-600 dark:text-gray-300",
            currentSize.text,
            styling.description
          )}
          data-testid={`${testIdPrefix}-description`}
        >
          {description}
        </p>
      )}
      
      <Form {...form}>
        <form 
          onSubmit={form.handleSubmit(handleEmailSubmit)} 
          className={cn(
            variant === "inline" ? "inline-flex items-end gap-2 w-full" : layoutClasses
          )}
          data-testid={`${testIdPrefix}-form`}
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className={layout === "horizontal" || variant === "inline" ? "flex-1" : ""}>
                <FormControl>
                  <Input
                    type="email"
                    placeholder={placeholder}
                    disabled={disabled || emailSignupMutation.isPending}
                    className={cn(
                      currentSize.input,
                      variantClasses.input,
                      styling.input,
                      disabled && "opacity-50 cursor-not-allowed"
                    )}
                    data-testid={`${testIdPrefix}-input`}
                    {...field}
                  />
                </FormControl>
                <FormMessage 
                  className="text-red-500 dark:text-red-400 text-xs sm:text-sm" 
                  data-testid={`${testIdPrefix}-error`}
                />
              </FormItem>
            )}
          />
          
          <Button
            type="submit"
            disabled={disabled || emailSignupMutation.isPending}
            className={cn(
              currentSize.button,
              variantClasses.button,
              styling.button,
              layout === "horizontal" && "shrink-0",
              variant === "inline" && "shrink-0",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            data-testid={`${testIdPrefix}-button`}
          >
            {emailSignupMutation.isPending ? (
              <>
                <Loader2 className={cn(currentSize.icon, "animate-spin mr-2")} data-testid={`${testIdPrefix}-loading-icon`} />
                {loadingText}
              </>
            ) : (
              <>
                {showIcon && <Mail className={cn(currentSize.icon, "mr-2")} data-testid={`${testIdPrefix}-mail-icon`} />}
                {buttonText}
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}