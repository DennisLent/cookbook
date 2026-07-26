// Comment thread UI for recipe discussions and author-side moderation actions.

 import { useState } from "react";
 import { Comment } from "@/types/social";
 import { useSocial } from "@/hooks/useSocial";
 import { useAuth } from "@/hooks/useAuth";
 import { Button } from "@/components/ui/button";
 import { Textarea } from "@/components/ui/textarea";
 import { Avatar, AvatarFallback } from "@/components/ui/avatar";
 import { Trash2, MessageSquare } from "lucide-react";
 import { formatDistanceToNow } from "date-fns";
 import { toast } from "@/hooks/use-toast";
 import { getApiErrorMessage } from "@/lib/api";
 
 interface CommentSectionProps {
   recipeId: string;
 }
 
 export const CommentSection = ({ recipeId }: CommentSectionProps) => {
   const { user, isAuthenticated, mode } = useAuth();
   const sharedNotes = mode === "single_user";
   const { getRecipeComments, addComment, deleteComment } = useSocial();
   const [newComment, setNewComment] = useState("");
   
   const comments = getRecipeComments(recipeId);
   
   const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (newComment.trim()) {
       try {
         await addComment(recipeId, newComment);
         setNewComment("");
       } catch (error) {
         toast({
           title: sharedNotes ? "Failed to add note" : "Failed to add comment",
           description: getApiErrorMessage(
             error,
             sharedNotes ? "The note could not be saved." : "The comment could not be posted.",
           ),
           variant: "destructive",
         });
       }
     }
   };
   
   const getInitials = (name: string) => {
     return name
       .split(" ")
       .map((n) => n[0])
       .join("")
       .toUpperCase()
       .slice(0, 2);
   };
   
   return (
     <div className="space-y-6">
       <div className="flex items-center gap-2">
         <MessageSquare className="w-5 h-5" />
         <h3 className="text-xl font-semibold">
           {sharedNotes ? "Notes" : "Comments"} {comments.length > 0 && `(${comments.length})`}
         </h3>
       </div>
       
       {/* Add comment form */}
       {isAuthenticated ? (
         <form onSubmit={handleSubmit} className="space-y-3">
           <Textarea
             placeholder={sharedNotes ? "Add a note about this recipe..." : "Share your thoughts about this recipe..."}
             value={newComment}
             onChange={(e) => setNewComment(e.target.value)}
             className="min-h-[80px]"
           />
           <Button type="submit" disabled={!newComment.trim()}>
             {sharedNotes ? "Add Note" : "Post Comment"}
           </Button>
         </form>
       ) : (
         <p className="text-sm text-muted-foreground">
           Please log in to leave a comment.
         </p>
       )}
       
       {/* Comments list */}
       <div className="space-y-4">
         {comments.length === 0 ? (
           <p className="text-sm text-muted-foreground">
             {sharedNotes ? "No notes yet." : "No comments yet. Be the first to share your thoughts!"}
           </p>
         ) : (
           comments.map((comment) => (
             <CommentCard
               key={comment.id}
               comment={comment}
               isOwner={user?.id === comment.userId}
               onDelete={async () => {
                 try {
                   await deleteComment(comment.id);
                 } catch (error) {
                   toast({
                     title: sharedNotes ? "Failed to delete note" : "Failed to delete comment",
                     description: getApiErrorMessage(
                       error,
                       sharedNotes ? "The note could not be deleted." : "The comment could not be deleted.",
                     ),
                     variant: "destructive",
                   });
                 }
               }}
               getInitials={getInitials}
             />
           ))
         )}
       </div>
     </div>
   );
 };
 
 interface CommentCardProps {
   comment: Comment;
   isOwner: boolean;
   onDelete: () => void;
   getInitials: (name: string) => string;
 }
 
 const CommentCard = ({ comment, isOwner, onDelete, getInitials }: CommentCardProps) => {
   return (
     <div className="flex gap-3 p-4 rounded-lg bg-muted/50">
       <Avatar className="w-8 h-8">
         <AvatarFallback className="text-xs">
           {getInitials(comment.userName)}
         </AvatarFallback>
       </Avatar>
       <div className="flex-1 space-y-1">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-2">
             <span className="font-medium text-sm">{comment.userName}</span>
             <span className="text-xs text-muted-foreground">
               {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
             </span>
           </div>
           {isOwner && (
             <Button
               variant="ghost"
               size="icon"
               className="h-6 w-6 text-muted-foreground hover:text-destructive"
               onClick={onDelete}
             >
               <Trash2 className="w-3 h-3" />
             </Button>
           )}
         </div>
         <p className="text-sm">{comment.text}</p>
       </div>
     </div>
   );
 };
