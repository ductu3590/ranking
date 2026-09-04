import './RoleActionBar.css';

export default function RoleActionBar({ permissions = {}, actions = [] }) {
    const allowedActions = actions.filter((action) => !action.permission || permissions[action.permission] === true);
    if (allowedActions.length === 0) return null;

    return (
        <div className="role-action-bar" aria-label="Thao tác theo quyền">
            {allowedActions.map((action) => action.href ? (
                <a key={action.id} href={action.href}>{action.label}</a>
            ) : (
                <button key={action.id} type="button" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>
            ))}
        </div>
    );
}
