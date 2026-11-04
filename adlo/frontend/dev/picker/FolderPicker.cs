using System;
using System.Windows.Forms;

class FolderPicker
{
    [STAThread]
    static void Main()
    {
        using (var dialog = new FolderBrowserDialog())
        {
            dialog.Description = "Select workspace folder";
            dialog.ShowNewFolderButton = true;
            if (dialog.ShowDialog() == DialogResult.OK)
            {
                Console.Write(dialog.SelectedPath);
            }
        }
    }
}
