import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Shield, Users, RefreshCw, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AdminDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<any>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '', password: '', isAdmin: false, reportCredits: 0 });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setCreatingUser(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const { id, ...payload } = data;
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setEditingUser(null);
    }
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['/api/admin/users'],
    enabled: !!(user as any)?.isAdmin,
  });

  if (authLoading || usersLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  // Double check authorization on client layer
  if (!(user as any)?.isAdmin) {
    navigate("/");
    return null;
  }

  const usersList = (users as any[]) || [];

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <Shield className="w-8 h-8 mr-3 text-indigo-600" />
              Super Admin Dashboard
            </h1>
            <p className="mt-2 text-gray-600">
              Manage application users and view system statistics.
            </p>
          </div>
          <div className="flex gap-4 border-l border-gray-200 pl-4 md:pl-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{usersList.length}</div>
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Users</div>
            </div>
            <div className="text-center ml-6">
              <div className="text-2xl font-bold text-gray-900 flex items-center">
                {usersList.reduce((acc: number, u: any) => acc + (u.totalReportsGenerated || 0), 0)}
              </div>
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Reports Run</div>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <Link href="/dashboard">
            <Button variant="outline" className="bg-white">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Return to User Dashboard
            </Button>
          </Link>
        </div>

        <Card className="shadow-md border-0 bg-white">
          <CardHeader className="bg-indigo-50/50 border-b border-indigo-100 pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-xl font-semibold flex items-center text-indigo-900">
              <Users className="w-5 h-5 mr-2 text-indigo-600" />
              Registered Users
            </CardTitle>
            <Button 
              size="sm" 
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => {
                setFormData({ username: '', email: '', password: '', isAdmin: false, reportCredits: 0 });
                setCreatingUser(true);
              }}
            >
              + Create New User
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {usersList.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="font-semibold text-gray-700">Email / Username</TableHead>
                      <TableHead className="font-semibold text-gray-700">Role</TableHead>
                      <TableHead className="font-semibold text-gray-700">Account Age</TableHead>
                      <TableHead className="font-semibold text-gray-700 text-right">Reports Generated</TableHead>
                      <TableHead className="font-semibold text-gray-700 text-right">Remaining Credits</TableHead>
                      <TableHead className="font-semibold text-gray-700 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersList.map((u: any) => {
                      const joinedDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Unknown';
                      return (
                        <TableRow key={u.id} className="hover:bg-gray-50">
                          <TableCell className="font-medium text-gray-900">
                            <div className="flex items-center gap-3">
                              {u.profileImageUrl ? (
                                <img src={u.profileImageUrl} alt="" className="w-8 h-8 rounded-full border border-gray-200" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                  {u.email ? u.email.charAt(0).toUpperCase() : '?'}
                                </div>
                              )}
                              <div>
                                <div>{u.firstName} {u.lastName}</div>
                                <div className="text-sm text-gray-500 font-normal">{u.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {u.isAdmin ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                Super Admin
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                User
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-gray-600">{joinedDate}</TableCell>
                          <TableCell className="text-right font-semibold">
                            <span className="bg-teal-50 text-teal-700 px-3 py-1 rounded-full">{u.totalReportsGenerated || 0}</span>
                          </TableCell>
                          <TableCell className="text-right text-gray-600">
                            {u.reportCredits || 0}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-indigo-600 hover:text-indigo-900 bg-indigo-50"
                              onClick={() => {
                                setFormData({ 
                                  username: u.username, 
                                  email: u.email || '', 
                                  password: '', 
                                  isAdmin: !!u.isAdmin, 
                                  reportCredits: u.reportCredits || 0 
                                });
                                setEditingUser(u);
                              }}
                            >
                              Edit Data
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-12 text-center text-gray-500">
                No users found.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Generic Modals */}
        {(creatingUser || editingUser) && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-xl font-bold mb-4">{creatingUser ? "Provision New User" : "Modify User Record"}</h2>
              
              <div className="space-y-4">
                {creatingUser && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                      <input type="text" className="w-full border p-2 rounded" value={formData.username} onChange={e => setFormData(f => ({...f, username: e.target.value}))} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input type="email" className="w-full border p-2 rounded" value={formData.email} onChange={e => setFormData(f => ({...f, email: e.target.value}))} />
                    </div>
                  </>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {editingUser ? "Reset Password (Optional)" : "Password"}
                  </label>
                  <input type="password" placeholder={editingUser ? "Leave blank to keep existing password" : ""} className="w-full border p-2 rounded" value={formData.password} onChange={e => setFormData(f => ({...f, password: e.target.value}))} />
                </div>

                <div className="flex justify-between gap-4">
                  <div className="w-1/2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account Role</label>
                    <select className="w-full border p-2 rounded" value={formData.isAdmin ? "admin" : "user"} onChange={e => setFormData(f => ({...f, isAdmin: e.target.value === 'admin'}))}>
                      <option value="user">Standard User</option>
                      <option value="admin">Super Admin</option>
                    </select>
                  </div>
                  <div className="w-1/2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Report Credits</label>
                    <input type="number" className="w-full border p-2 rounded" value={formData.reportCredits} onChange={e => setFormData(f => ({...f, reportCredits: parseInt(e.target.value) || 0}))} />
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                  <Button variant="outline" onClick={() => { setCreatingUser(false); setEditingUser(null); }} disabled={createMutation.isPending || updateMutation.isPending}>
                    Cancel
                  </Button>
                  <Button 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white" 
                    disabled={createMutation.isPending || updateMutation.isPending}
                    onClick={() => {
                      if (creatingUser) {
                        createMutation.mutate(formData);
                      } else {
                        updateMutation.mutate({ id: editingUser.id, ...formData });
                      }
                    }}
                  >
                    {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Configuration"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
